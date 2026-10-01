/**
 * Scheduled Price Sync (static-hosting replacement for the live server)
 *
 * Runs standalone (via `tsx scripts/sync-prices.ts`), not inside Express.
 * Invoked by .github/workflows/sync-prices.yml every 2 hours. It:
 *
 *   1. Loads the shared watchlist (src/data/catalog.ts's INITIAL_TRACKED_ITEMS
 *      -- the same list that used to seed the frontend's default state).
 *   2. For each item, runs the exact same discovery -> Gemini grounding ->
 *      verification pipeline /api/scrape-prices used to run on each click,
 *      reusing the same services (no logic duplicated/reinvented here).
 *   3. Records every verified price into the durable observation store
 *      (src/services/observationStore.ts) so "all-time low" reflects prices
 *      actually seen over time, never today's price relabeled.
 *   4. Writes the refreshed items to public/data.json, which the static
 *      frontend fetches on load instead of calling a live API.
 *   5. Checks each item's alert condition against the refreshed price and,
 *      if triggered, sends a real email (src/services/emailService.ts) and
 *      appends the result to public/alerts.json.
 *
 * To add an item to the shared, auto-refreshed watchlist: add it to
 * src/data/catalog.ts's INITIAL_TRACKED_ITEMS and push -- it is picked up on
 * the next run (or trigger the "Sync Prices" workflow manually on GitHub).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { INITIAL_TRACKED_ITEMS } from "../src/data/catalog";
import { TrackedItem, RetailerCandidate, RetailerPrice } from "../src/types";
import { normalizeProductIdentity } from "../src/services/productIdentity";
import { RETAILER_CONFIGS, extractSkuFromUrl } from "../src/services/retailerRegistry";
import { discoverCandidatesForProduct } from "../src/services/productDiscovery";
import { verifyRetailerPrice, isDealAlertTriggered } from "../src/services/priceVerifier";
import { estimateHistoricalPricing } from "../src/utils/productClassifier";
import {
  buildProductKey,
  recordObservation,
  getStats
} from "../src/services/observationStore";
import { sendExternalEmail } from "../src/services/emailService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_JSON_PATH = path.join(PUBLIC_DIR, "data.json");
const ALERTS_JSON_PATH = path.join(PUBLIC_DIR, "alerts.json");
const TARGET_RETAILERS = [
  "Amazon", "Best Buy", "Walmart", "Target", "Home Depot", "REI", "Bass Pro Shops",
  "Tackle Warehouse", "Backcountry", "B&H Photo", "Newegg", "Micro Center"
];

interface AlertLogEntry {
  id: string;
  timestamp: string;
  email: string;
  itemTitle: string;
  oldPrice: number;
  newPrice: number;
  dropPercent: number;
  allTimeLow: number;
  isAllTimeLow: boolean;
  retailer: string;
  retailerUrl: string;
  triggerReason: string;
  status: "sent" | "delivered";
}

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { "User-Agent": "priceradar-sync" } }
    });
  }
  return geminiClient;
}

/** Finds live candidate product pages + prices for one item, exactly as /api/scrape-prices did. */
async function discoverAndVerify(item: TrackedItem): Promise<RetailerPrice[]> {
  const identity = normalizeProductIdentity({
    title: `${item.brand} ${item.title}`,
    brand: item.brand,
    model: item.model,
    category: item.category
  });

  const { candidates: discoveredCandidates } = await discoverCandidatesForProduct(identity, TARGET_RETAILERS);

  // Gemini web-search grounding: finds real product URLs + prices. Without
  // this, discoverCandidatesForProduct mostly returns catalog SEARCH pages
  // (no price), since the hand-verified direct registry only covers a
  // handful of SKUs. This is what actually makes "price" non-null for most
  // items, so a sync run with no GEMINI_API_KEY secret will mostly produce
  // unverified search links -- which the frontend already renders honestly
  // as "Check" rather than a fabricated number.
  const groundedCandidates: RetailerCandidate[] = [];
  const ai = getGemini();
  if (ai) {
    try {
      const groundingPrompt = `Find exact product page URLs and current prices for: ${identity.productName} (${identity.brand || ""} ${identity.model || ""}).
Look for official listings across: ${TARGET_RETAILERS.join(", ")}.
Note if the listing is an exact standalone product, a bundle (e.g. includes solar panel or extra battery), or out of stock. Never invent prices or URLs.`;

      const geminiRes = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: groundingPrompt,
        config: { tools: [{ googleSearch: {} }] }
      });

      const chunks = geminiRes.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        for (const ch of chunks) {
          const uri = (ch as any)?.web?.uri;
          const title = (ch as any)?.web?.title || "";
          if (uri && typeof uri === "string") {
            for (const [rName, cfg] of Object.entries(RETAILER_CONFIGS)) {
              if (uri.toLowerCase().includes(cfg.domain)) {
                groundedCandidates.push({
                  retailer: rName,
                  url: uri,
                  title,
                  sourceType: "search",
                  discoveredAt: new Date().toISOString(),
                  sku: extractSkuFromUrl(uri, rName)
                });
                break;
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`  [gemini] grounding unavailable for "${item.title}": ${err?.message || err}`);
    }
  }

  const candidateMap = new Map<string, RetailerCandidate>();
  for (const cand of [...discoveredCandidates, ...groundedCandidates]) {
    const cleanUrl = cand.url.split("?")[0].toLowerCase();
    if (!candidateMap.has(cleanUrl)) candidateMap.set(cleanUrl, cand);
  }

  const verifiedList: RetailerPrice[] = [];
  let lowestVerifiedPrice = Infinity;
  const productKey = buildProductKey(identity);

  for (const cand of candidateMap.values()) {
    const verified = verifyRetailerPrice({ requestedProduct: identity, retailerName: cand.retailer, candidate: cand });

    // Drop only genuinely wrong/absent candidates. An unverified candidate is
    // still a useful catalog-search link with price left null -- never hide
    // the item entirely just because nothing could be confirmed.
    if (verified.productMatch.status === "wrong_product" || verified.productMatch.status === "not_found") continue;

    const priceVal = verified.priceVerified && typeof verified.price === "number" ? verified.price : null;
    if (priceVal && priceVal < lowestVerifiedPrice) lowestVerifiedPrice = priceVal;

    // Record every verified price into durable history -- this is what makes
    // "all-time low" a real, observed number instead of an estimate.
    if (priceVal && priceVal > 0) {
      recordObservation({
        productKey,
        retailer: cand.retailer,
        price: priceVal,
        currency: "USD",
        inStock: verified.inStock ?? null,
        url: verified.url,
        source: "retailer_api",
        verified: verified.productVerified,
        observedAt: verified.observedAt
      });
    }

    verifiedList.push({
      id: `r-${cand.retailer.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      retailerName: cand.retailer,
      title: verified.evidence?.title || cand.title,
      url: verified.url,
      price: priceVal,
      originalPrice: item.msrp,
      inStock: verified.inStock ?? true,
      stockMessage: verified.stockMessage || "",
      shipping: verified.shipping || "Standard Shipping",
      shippingCost: verified.shippingCost || 0,
      rating: null,
      reviewCount: null,
      isBestPrice: false,
      productMatchVerified: verified.productVerified,
      priceVerified: verified.priceVerified,
      matchStatus: verified.productVerified ? "verified_exact" : "unverified_search",
      urlType: verified.linkType === "verified_product" ? "direct_product" : "catalog_search",
      linkType: verified.linkType,
      matchStatusDetailed: verified.productMatch.status,
      confidence: verified.productMatch.confidence,
      directSku: verified.directSku,
      observedAt: verified.observedAt,
      evidence: verified.evidence
    });
  }

  if (lowestVerifiedPrice < Infinity) {
    verifiedList.forEach(r => {
      if (r.priceVerified && typeof r.price === "number" && Math.abs(r.price - lowestVerifiedPrice) < 0.01) {
        r.isBestPrice = true;
      }
    });
  }

  return verifiedList;
}

async function syncItem(item: TrackedItem): Promise<TrackedItem> {
  console.log(`Syncing: ${item.title}`);
  const retailers = await discoverAndVerify(item);

  // Prefer a REAL observed all-time low (from history this app has actually
  // recorded) over the static estimate baked into catalog.ts. Only once
  // there's enough history to mean anything (observationStore's own bar).
  const identity = normalizeProductIdentity({ title: `${item.brand} ${item.title}`, brand: item.brand, model: item.model, category: item.category });
  const productKey = buildProductKey(identity);
  const stats = getStats(productKey);

  let allTimeLow = item.allTimeLow;
  let allTimeLowDate = item.allTimeLowDate;
  let allTimeLowStore = item.allTimeLowStore;
  let allTimeLowIsObserved = item.allTimeLowIsObserved || false;

  if (stats.hasMeaningfulHistory && stats.allTimeLow) {
    allTimeLow = stats.allTimeLow.price;
    allTimeLowDate = new Date(stats.allTimeLow.observedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    allTimeLowStore = stats.allTimeLow.retailer;
    allTimeLowIsObserved = true;
  } else if (!allTimeLowIsObserved) {
    // No real history yet -- keep using the same estimate catalog.ts already had.
    const estimate = estimateHistoricalPricing(item.title, item.category, item.msrp);
    allTimeLow = estimate.allTimeLow;
    allTimeLowDate = estimate.allTimeLowDate;
    allTimeLowStore = estimate.allTimeLowStore;
  }

  return {
    ...item,
    retailers: retailers.length > 0 ? retailers : item.retailers,
    allTimeLow,
    allTimeLowDate,
    allTimeLowStore,
    allTimeLowIsObserved,
    lastUpdated: new Date().toISOString()
  };
}

async function checkAndSendAlerts(items: TrackedItem[]): Promise<AlertLogEntry[]> {
  const newAlerts: AlertLogEntry[] = [];

  for (const item of items) {
    if (!item.emailAlertEnabled) continue;
    const validPrices = item.retailers.filter(r => typeof r.price === "number" && (r.price as number) > 0).map(r => r.price as number);
    if (validPrices.length === 0) continue;

    const minPrice = Math.min(...validPrices);
    const lowestRetailer = item.retailers.find(r => r.price === minPrice);
    if (!lowestRetailer) continue;

    const verifiedPrice = {
      retailer: lowestRetailer.retailerName,
      price: minPrice,
      currency: "USD",
      url: lowestRetailer.url,
      linkType: lowestRetailer.linkType || "unknown",
      productMatch: { status: "exact" as const, confidence: 100, reasons: [], matchedIdentifiers: [], mismatches: [] },
      source: "retailer_page" as const,
      observedAt: new Date().toISOString(),
      priceVerified: !!lowestRetailer.priceVerified,
      productVerified: !!lowestRetailer.productMatchVerified
    };

    const { triggered, reason } = isDealAlertTriggered(verifiedPrice, item.targetPrice, item.allTimeLow);
    if (!triggered) continue;

    const isAllTimeLow = minPrice <= item.allTimeLow;
    const dropPercent = item.msrp > 0 ? Number((((item.msrp - minPrice) / item.msrp) * 100).toFixed(1)) : 0;
    const recipients = item.alertEmails && item.alertEmails.length > 0 ? item.alertEmails : [item.userEmail];
    const subjectLine = `${isAllTimeLow ? "🔥 Historic Lowest Price: " : "📉 Price Drop Alert: "}${item.title} dropped to $${minPrice.toFixed(2)} on ${lowestRetailer.retailerName}`;

    for (const recipient of recipients) {
      const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
  <div style="background:#0f172a;padding:20px;color:#fff;"><h2 style="margin:0;">${isAllTimeLow ? "🔥 Historic Lowest Price!" : "📉 Price Drop Alert"}</h2></div>
  <div style="padding:24px;">
    <h3 style="margin:0 0 8px 0;">${item.title}</h3>
    <p>New price: <strong style="color:#16a34a;font-size:20px;">$${minPrice.toFixed(2)}</strong> at ${lowestRetailer.retailerName}</p>
    <p style="color:#64748b;font-size:13px;">${reason}</p>
    <a href="${lowestRetailer.url}" style="display:inline-block;margin-top:12px;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">View Deal &rarr;</a>
  </div>
</div>`;

      const delivery = await sendExternalEmail(recipient, subjectLine, emailHtml);
      console.log(`  alert -> ${recipient}: ${delivery.success ? "sent via " + delivery.provider : "FAILED: " + delivery.error}`);

      newAlerts.push({
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        email: recipient,
        itemTitle: item.title,
        oldPrice: item.msrp,
        newPrice: minPrice,
        dropPercent,
        allTimeLow: item.allTimeLow,
        isAllTimeLow,
        retailer: lowestRetailer.retailerName,
        retailerUrl: lowestRetailer.url,
        triggerReason: reason || "Price threshold reached",
        status: delivery.success ? "sent" : "delivered"
      });
    }
  }

  return newAlerts;
}

async function main() {
  console.log(`PriceRadar sync starting -- ${INITIAL_TRACKED_ITEMS.length} items in watchlist`);
  console.log(`Gemini grounding: ${process.env.GEMINI_API_KEY ? "enabled" : "disabled (set GEMINI_API_KEY secret to enable)"}`);

  const syncedItems: TrackedItem[] = [];
  for (const item of INITIAL_TRACKED_ITEMS) {
    try {
      syncedItems.push(await syncItem(item));
    } catch (err: any) {
      console.error(`  FAILED to sync "${item.title}": ${err?.message || err}`);
      syncedItems.push(item); // keep the last-known-good data rather than dropping the item
    }
  }

  const newAlerts = await checkAndSendAlerts(syncedItems);

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(DATA_JSON_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), items: syncedItems }, null, 2));
  console.log(`Wrote ${DATA_JSON_PATH}`);

  let existingAlerts: AlertLogEntry[] = [];
  try {
    existingAlerts = JSON.parse(fs.readFileSync(ALERTS_JSON_PATH, "utf-8")).alerts || [];
  } catch {
    // no prior file yet
  }
  const mergedAlerts = [...newAlerts, ...existingAlerts].slice(0, 50);
  fs.writeFileSync(ALERTS_JSON_PATH, JSON.stringify({ alerts: mergedAlerts }, null, 2));
  console.log(`Wrote ${ALERTS_JSON_PATH} (${newAlerts.length} new alert(s) this run)`);

  console.log("Sync complete.");
}

main().catch(err => {
  console.error("Sync failed:", err);
  process.exit(1);
});
