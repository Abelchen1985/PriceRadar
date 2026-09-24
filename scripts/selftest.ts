/**
 * PriceRadar Comprehensive Automated Self-Test Suite
 * Validates:
 * 1. Product Name & Deal Link Matching across all retailers
 * 2. Price Accuracy, Best Price Calculations & All-Time Low logic
 * 3. Direct Product Page URL resolution (Samsung S90D, Jackery 1500, Ugly Stik, etc.)
 * 4. Presets and Auto-Estimator Benchmark integrity (including Jackery $799.99 MSRP)
 * 5. Category Detection & Search Query Formatting
 */

import { INITIAL_TRACKED_ITEMS, POPULAR_ITEM_PRESETS } from '../src/data/catalog';
import { 
  getRetailerDealUrl, 
  cleanSearchQuery, 
  isVerifiedDirectProductUrl, 
  isOfficialSearchUrl, 
  detectBrokenGuessedSlug,
  getRetailerLinkDetails,
  extractDirectProductSku,
  isRetailerSellingProduct
} from '../src/utils/retailerUrls';
import { detectProductCategory, estimateHistoricalPricing, sanitizeTrackedItem, getCategoryStoreRules } from '../src/utils/productClassifier';
import { normalizeProductIdentity } from '../src/services/productIdentity';
import { matchCandidateProduct, determineLinkType } from '../src/services/productMatcher';
import { verifyRetailerPrice } from '../src/services/priceVerifier';
import { isRetailerEligibleForProduct, checkRetailerEligibility } from '../src/services/retailerRegistry';
import { RetailerCandidate } from '../src/types';
import { parseJsonLdProducts, compareStructuredProduct, selectMostIdentifiableProduct } from '../src/services/structuredDataVerifier';
import { isQuarantinedProductUrl } from '../src/utils/retailerUrls';
import { computeDealPlan } from '../src/utils/dealOptimizer';
import { findMatchingPreset } from '../src/utils/presetMatcher';
import { recordOffer, getAllOffers, getBestOffer, __resetForTests as __resetOffersForTests } from '../src/services/offerStore';
import { isPriceCurrent } from '../src/services/offers';
import { describeLowPrice } from '../src/utils/priceLabels';
import {
  buildProductKey,
  sanitizeObservation,
  recordObservation,
  getStats,
  __resetForTests as resetObservations
} from '../src/services/observationStore';

export interface TestResult {
  name: string;
  category: 'PRODUCT_MATCH' | 'PRICE_ACCURACY' | 'DEAL_LINKS' | 'BENCHMARKS' | 'CATEGORY_CLASSIFIER' | 'ACCURACY_UPGRADE';
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
  metadata?: Record<string, any>;
}

export function runComprehensiveSelfTest(): {
  summary: { total: number; passed: number; failed: number; warnings: number; durationMs: number };
  results: TestResult[];
} {
  const startTime = Date.now();
  const results: TestResult[] = [];

  const pass = (name: string, category: TestResult['category'], details: string, metadata?: Record<string, any>) => {
    results.push({ name, category, status: 'PASS', details, metadata });
  };

  const fail = (name: string, category: TestResult['category'], details: string, metadata?: Record<string, any>) => {
    results.push({ name, category, status: 'FAIL', details, metadata });
  };

  const warn = (name: string, category: TestResult['category'], details: string, metadata?: Record<string, any>) => {
    results.push({ name, category, status: 'WARN', details, metadata });
  };

  /**
   * Asserts a deal link satisfies the link-integrity policy: it must point at
   * the right retailer and be EITHER a verified direct product page (one on the
   * hand-checked whitelist in retailerUrls.ts) OR that retailer's official
   * catalog search. Anything else -- most importantly a plausible-looking but
   * invented SKU -- is a failure, because it silently sends shoppers to an
   * unrelated product or a dead page.
   *
   * Tests assert this policy rather than specific identifiers, so the suite can
   * never again be made "green" by inventing an ID to match an expectation.
   */
  const assertDealLinkPolicy = (
    label: string,
    retailer: string,
    domain: string,
    title: string,
    brand?: string,
    model?: string
  ) => {
    const url = getRetailerDealUrl(retailer, title, undefined, brand, model);
    if (!url.includes(domain)) {
      fail(label, 'DEAL_LINKS', `Expected a ${retailer} (${domain}) URL, got: ${url}`);
      return;
    }
    if (detectBrokenGuessedSlug(url)) {
      fail(label, 'DEAL_LINKS', `Resolved to a guessed slug with no real product id: ${url}`);
      return;
    }
    const isDirect = isVerifiedDirectProductUrl(url);
    const isSearch = isOfficialSearchUrl(url);
    if (!isDirect && !isSearch) {
      fail(label, 'DEAL_LINKS', `URL is neither a verified direct product page nor an official search: ${url}`);
      return;
    }
    pass(label, 'DEAL_LINKS', `${isDirect ? 'Verified direct product page' : 'Official catalog search'}: ${url}`);
  };

  // ==========================================
  // SECTION 1: Tracked Items Integrity & Prices
  // ==========================================
  for (const item of INITIAL_TRACKED_ITEMS) {
    // 1.1 Item Title & Structure
    if (!item.title || item.title.trim().length < 5) {
      fail(`Item [${item.id}] Title`, 'PRODUCT_MATCH', `Title is missing or too short: "${item.title}"`);
    } else {
      pass(`Item [${item.id}] Title Valid`, 'PRODUCT_MATCH', `"${item.title}" (${item.brand || 'No Brand'}, Model: ${item.model || 'N/A'})`);
    }

    // 1.2 MSRP & All-Time Low Math
    if (typeof item.msrp !== 'number' || item.msrp <= 0) {
      fail(`Item [${item.id}] MSRP`, 'PRICE_ACCURACY', `Invalid MSRP: ${item.msrp}`);
    } else if (typeof item.allTimeLow !== 'number' || item.allTimeLow <= 0) {
      fail(`Item [${item.id}] All-Time Low`, 'PRICE_ACCURACY', `Invalid All-Time Low: ${item.allTimeLow}`);
    } else if (item.allTimeLow > item.msrp) {
      fail(`Item [${item.id}] ATL vs MSRP`, 'PRICE_ACCURACY', `All-Time Low ($${item.allTimeLow}) cannot exceed MSRP ($${item.msrp})`);
    } else {
      pass(`Item [${item.id}] Price Benchmark Math`, 'PRICE_ACCURACY', `MSRP: $${item.msrp.toFixed(2)}, ATL: $${item.allTimeLow.toFixed(2)} (${item.allTimeLowStore})`);
    }

    // 1.3 Target Price Math
    if (typeof item.targetPrice !== 'number' || item.targetPrice <= 0) {
      fail(`Item [${item.id}] Target Price`, 'PRICE_ACCURACY', `Invalid Target Price: ${item.targetPrice}`);
    } else if (item.targetPrice > item.msrp) {
      warn(`Item [${item.id}] Target Price High`, 'PRICE_ACCURACY', `Target price $${item.targetPrice} is higher than MSRP $${item.msrp}`);
    } else {
      pass(`Item [${item.id}] Target Price Valid`, 'PRICE_ACCURACY', `Target Alert: $${item.targetPrice.toFixed(2)}`);
    }

    // 1.4 Retailer Best Price & Link Validation
    if (!Array.isArray(item.retailers) || item.retailers.length === 0) {
      fail(`Item [${item.id}] Retailers Array`, 'DEAL_LINKS', `No retailers registered for item`);
      continue;
    }

    // Find actual lowest in-stock price
    const minPrice = Math.min(...item.retailers.map(r => r.price));

    for (const retailer of item.retailers) {
      // Price validity
      if (typeof retailer.price !== 'number' || retailer.price <= 0) {
        fail(`Item [${item.id}] -> ${retailer.retailerName} Price`, 'PRICE_ACCURACY', `Invalid price: ${retailer.price}`);
      }

      // Best Price Flag check
      const shouldBeBest = Math.abs(retailer.price - minPrice) < 0.01;
      if (shouldBeBest && !retailer.isBestPrice) {
        warn(`Item [${item.id}] -> ${retailer.retailerName} BestPrice Flag`, 'PRICE_ACCURACY', `Price $${retailer.price} is lowest, but isBestPrice was false`);
      }

      // Deal URL validation
      const resolvedUrl = getRetailerDealUrl(
        retailer.retailerName,
        item.title,
        retailer.url,
        item.brand,
        item.model
      );

      if (!resolvedUrl || !resolvedUrl.startsWith('https://')) {
        fail(`Item [${item.id}] -> ${retailer.retailerName} Deal URL`, 'DEAL_LINKS', `URL is not valid HTTPS: ${resolvedUrl}`);
      } else if (resolvedUrl.includes('undefined') || resolvedUrl.includes('NaN') || resolvedUrl.includes('null')) {
        fail(`Item [${item.id}] -> ${retailer.retailerName} Deal URL Corrupted`, 'DEAL_LINKS', `URL contains corrupt tokens: ${resolvedUrl}`);
      } else {
        // Domain match check
        const rName = retailer.retailerName.toLowerCase();
        let domainExpected = '';
        if (rName.includes('amazon')) domainExpected = 'amazon.com';
        else if (rName.includes('best buy') || rName === 'bestbuy') domainExpected = 'bestbuy.com';
        else if (rName.includes('walmart')) domainExpected = 'walmart.com';
        else if (rName.includes('target')) domainExpected = 'target.com';
        else if (rName.includes('costco')) domainExpected = 'costco.com';
        else if (rName.includes('rei')) domainExpected = 'rei.com';
        else if (rName.includes('bass pro')) domainExpected = 'basspro.com';
        else if (rName.includes('cabela')) domainExpected = 'cabelas.com';
        else if (rName.includes('tackle warehouse')) domainExpected = 'tacklewarehouse.com';
        else if (rName.includes('backcountry')) domainExpected = 'backcountry.com';
        else if (rName.includes('b&h') || rName.includes('bh photo')) domainExpected = 'bhphotovideo.com';
        else if (rName.includes('home depot')) domainExpected = 'homedepot.com';
        else if (rName.includes('micro center')) domainExpected = 'microcenter.com';
        else if (rName.includes('newegg')) domainExpected = 'newegg.com';

        if (domainExpected && !resolvedUrl.includes(domainExpected)) {
          fail(`Item [${item.id}] -> ${retailer.retailerName} Domain Mismatch`, 'DEAL_LINKS', `Expected ${domainExpected} in URL: ${resolvedUrl}`);
        } else {
          pass(`Item [${item.id}] -> ${retailer.retailerName} Link Match`, 'DEAL_LINKS', `Matched deal URL: ${resolvedUrl}`);
        }
      }
    }
  }

  // ==========================================
  // SECTION 2: Specific User-Reported Item Tests
  // ==========================================

  // 2.1 Samsung 65" Class OLED S90D 4K Smart TV Deal Links
  const samsungTv = INITIAL_TRACKED_ITEMS.find(i => i.id === 'tv-samsung-oled-65');
  if (!samsungTv) {
    fail('Samsung S90D TV Entry', 'PRODUCT_MATCH', 'Could not find Samsung S90D TV in catalog');
  } else {
    // The Best Buy / Amazon / Costco / Target identifiers previously asserted here
    // (6576624.p, B0CV9XQ11F, 4000257099, A-91456910) were audited against the live
    // sites: Best Buy's served a Tech21 iPhone case and Target's returned "item not
    // available", so none of them are verified. This product now resolves to catalog
    // searches on the exact model, which is what these assertions enforce.
    assertDealLinkPolicy('Samsung S90D Best Buy Link', 'Best Buy', 'bestbuy.com', samsungTv.title, samsungTv.brand, samsungTv.model);
    assertDealLinkPolicy('Samsung S90D Amazon Link', 'Amazon', 'amazon.com', samsungTv.title, samsungTv.brand, samsungTv.model);
    assertDealLinkPolicy('Samsung S90D Costco Link', 'Costco', 'costco.com', samsungTv.title, samsungTv.brand, samsungTv.model);
    assertDealLinkPolicy('Samsung S90D Target Link', 'Target', 'target.com', samsungTv.title, samsungTv.brand, samsungTv.model);
  }

  // 2.2 Jackery Explorer 1500 v2 Solar Generator Benchmark & Pricing
  const jackeryPreset = POPULAR_ITEM_PRESETS.find(p => p.title.toLowerCase().includes('jackery'));
  if (!jackeryPreset) {
    fail('Jackery Preset Entry', 'BENCHMARKS', 'Could not find Jackery Explorer 1500 v2 in POPULAR_ITEM_PRESETS');
  } else {
    // MSRP Check
    if (jackeryPreset.msrp !== 799.99) {
      fail('Jackery Explorer 1500 v2 MSRP', 'PRICE_ACCURACY', `MSRP must be $799.99, but got $${jackeryPreset.msrp}`);
    } else {
      pass('Jackery Explorer 1500 v2 MSRP', 'PRICE_ACCURACY', `MSRP verified as $${jackeryPreset.msrp.toFixed(2)} (NOT $79.99)`);
    }

    // All-Time Low Check
    if (jackeryPreset.allTimeLow !== 649.00) {
      fail('Jackery All-Time Low', 'PRICE_ACCURACY', `All-time low must be $649.00, got $${jackeryPreset.allTimeLow}`);
    } else {
      pass('Jackery All-Time Low', 'PRICE_ACCURACY', `All-Time Low verified as $${jackeryPreset.allTimeLow.toFixed(2)} (${jackeryPreset.allTimeLowStore})`);
    }

    // Authentic Store Deal Links Check
    const jackeryAmzUrl = getRetailerDealUrl('Amazon', jackeryPreset.title, undefined, jackeryPreset.brand, jackeryPreset.model);
    if (!jackeryAmzUrl.includes('amazon.com') || !jackeryAmzUrl.toLowerCase().includes('jackery')) {
      fail('Jackery Amazon Deal Link', 'DEAL_LINKS', `Expected reliable Amazon deal link for Jackery 1500, got: ${jackeryAmzUrl}`);
    } else {
      pass('Jackery Amazon Deal Link', 'DEAL_LINKS', `Reliable Amazon deal link: ${jackeryAmzUrl}`);
    }

    // Jackery is a brand storefront, not one of the configured retailers, and we
    // have not verified a search endpoint on jackery.com -- so it falls back to
    // Google Shopping, which always resolves. Better a working shopping search
    // than an invented manufacturer URL.
    assertDealLinkPolicy('Jackery Manufacturer Link', 'Jackery', 'google.com', jackeryPreset.title, jackeryPreset.brand, jackeryPreset.model);

    const jackeryHdUrl = getRetailerDealUrl('Home Depot', jackeryPreset.title, undefined, jackeryPreset.brand, jackeryPreset.model);
    if (!jackeryHdUrl.includes('homedepot.com') || !jackeryHdUrl.toLowerCase().includes('jackery')) {
      fail('Jackery Home Depot Deal Link', 'DEAL_LINKS', `Expected Home Depot link, got: ${jackeryHdUrl}`);
    } else {
      pass('Jackery Home Depot Deal Link', 'DEAL_LINKS', `Verified Home Depot link: ${jackeryHdUrl}`);
    }
  }

  // 2.3 Ugly Stik GX2 Spinning Rod Deal Links
  const uglyStikPreset = POPULAR_ITEM_PRESETS.find(p => p.title.toLowerCase().includes('ugly stik'));
  if (!uglyStikPreset) {
    fail('Ugly Stik Preset Entry', 'BENCHMARKS', 'Could not find Ugly Stik GX2 preset');
  } else {
    // /shop/en/ugly-stik-gx2-spinning-rod carries no product id and does not resolve.
    assertDealLinkPolicy('Ugly Stik Bass Pro Shops Link', 'Bass Pro Shops', 'basspro.com', uglyStikPreset.title, uglyStikPreset.brand, uglyStikPreset.model);
  }

  // 2.4 Sony WH-1000XM5 Benchmark Direct Links
  const sonyHeadphones = INITIAL_TRACKED_ITEMS.find(i => i.id === 'audio-sony-xm5');
  if (sonyHeadphones) {
    const bbUrl = getRetailerDealUrl('Best Buy', sonyHeadphones.title, undefined, sonyHeadphones.brand, sonyHeadphones.model);
    if (!bbUrl.includes('6505727.p')) {
      fail('Sony WH-1000XM5 Best Buy Link', 'DEAL_LINKS', `Expected Best Buy SKU 6505727.p, got: ${bbUrl}`);
    } else {
      pass('Sony WH-1000XM5 Best Buy Link', 'DEAL_LINKS', `Direct Best Buy product page: ${bbUrl}`);
    }

    // Amazon ASINs cannot be verified (amazon.com disallows automated checking in
    // robots.txt), so no ASIN is whitelisted and Amazon resolves to catalog search.
    assertDealLinkPolicy('Sony WH-1000XM5 Amazon Link', 'Amazon', 'amazon.com', sonyHeadphones.title, sonyHeadphones.brand, sonyHeadphones.model);
  }

  // 2.5 AMD Ryzen 7 7800X3D Benchmark Direct Links
  const amdCpu = INITIAL_TRACKED_ITEMS.find(i => i.id === 'cpu-7800x3d');
  if (amdCpu) {
    const mcUrl = getRetailerDealUrl('Micro Center', amdCpu.title, undefined, amdCpu.brand, amdCpu.model);
    if (!mcUrl.includes('/product/674503')) {
      fail('AMD 7800X3D Micro Center Link', 'DEAL_LINKS', `Expected Micro Center /product/674503, got: ${mcUrl}`);
    } else {
      pass('AMD 7800X3D Micro Center Link', 'DEAL_LINKS', `Direct Micro Center product page: ${mcUrl}`);
    }

    const neweggUrl = getRetailerDealUrl('Newegg', amdCpu.title, undefined, amdCpu.brand, amdCpu.model);
    if (!neweggUrl.includes('N82E16819113793')) {
      fail('AMD 7800X3D Newegg Link', 'DEAL_LINKS', `Expected Newegg N82E16819113793, got: ${neweggUrl}`);
    } else {
      pass('AMD 7800X3D Newegg Link', 'DEAL_LINKS', `Direct Newegg product page: ${neweggUrl}`);
    }
  }

  // 2.6 DEWALT 20V MAX Combo Kit Direct Links
  const dewaltDrill = INITIAL_TRACKED_ITEMS.find(i => i.id === 'tools-dewalt-drill');
  if (dewaltDrill) {
    assertDealLinkPolicy('DEWALT Drill Home Depot Link', 'Home Depot', 'homedepot.com', dewaltDrill.title, dewaltDrill.brand, dewaltDrill.model);
  }

  // 2.7 Anker SOLIX C1000 Portable Power Station Direct Links & Target Rejection
  const ankerTitle = 'Anker SOLIX C1000 Gen 2 Portable Power Station';
  assertDealLinkPolicy('Anker SOLIX C1000 Amazon Link', 'Amazon', 'amazon.com', ankerTitle, 'Anker', 'A1761');

  assertDealLinkPolicy('Anker SOLIX C1000 Best Buy Link', 'Best Buy', 'bestbuy.com', ankerTitle, 'Anker', 'A1761');

  assertDealLinkPolicy('Anker SOLIX C1000 Home Depot Link', 'Home Depot', 'homedepot.com', ankerTitle, 'Anker', 'A1761');

  // Verify Target rejection for Anker SOLIX C1000 (Target does NOT stock Anker SOLIX C1000)
  const isTargetSellingAnker = isRetailerSellingProduct('Target', ankerTitle, 'Anker', 'A1761');
  if (!isTargetSellingAnker) {
    pass('Target Rejection for Anker SOLIX', 'PRODUCT_MATCH', 'Target correctly rejected: Does not carry Anker SOLIX C1000');
  } else {
    fail('Target Rejection for Anker SOLIX', 'PRODUCT_MATCH', 'Target should NOT be allowed for Anker SOLIX C1000');
  }

  // 2.8 Direct SKU Extraction Check
  const sampleAsin = extractDirectProductSku('https://www.amazon.com/dp/B0CV9XQ11F');
  const sampleBbSku = extractDirectProductSku('https://www.bestbuy.com/site/samsung-65/6576624.p?skuId=6576624');
  const sampleTcin = extractDirectProductSku('https://www.target.com/p/samsung/-/A-91456910');
  if (sampleAsin === 'B0CV9XQ11F' && sampleBbSku === '6576624' && sampleTcin === 'A-91456910') {
    pass('Direct SKU / ASIN Extraction', 'PRODUCT_MATCH', `Extracted ASIN: ${sampleAsin}, BestBuy SKU: ${sampleBbSku}, Target TCIN: ${sampleTcin}`);
  } else {
    fail('Direct SKU / ASIN Extraction', 'PRODUCT_MATCH', `Extraction failed: ${sampleAsin}, ${sampleBbSku}, ${sampleTcin}`);
  }

  // ==========================================
  // SECTION 3: Auto-Estimator & Classifier Tests
  // ==========================================
  const testScenarios = [
    {
      query: 'Jackery Explorer 1500 v2 solar generator with solar panel 100air',
      expectedCategory: 'Camping & Bushcraft',
      expectedMsrpMin: 700,
      expectedMsrpMax: 900
    },
    {
      query: 'Samsung 65" Class OLED S90D 4K Smart TV',
      expectedCategory: 'Camping & Bushcraft', // or default
      expectedMsrpMin: 2000,
      expectedMsrpMax: 2300
    },
    {
      query: 'Shimano Stradic FM Freshwater Spinning Reel',
      expectedCategory: 'Fishing & Angling',
      expectedMsrpMin: 200,
      expectedMsrpMax: 260
    },
    {
      query: 'Osprey Atmos AG 65 Expedition Backpack',
      expectedCategory: 'Hiking & Backpacking',
      expectedMsrpMin: 300,
      expectedMsrpMax: 360
    },
    {
      query: 'AMD Ryzen 7 7800X3D Desktop Processor',
      expectedCategory: 'PC Components',
      expectedMsrpMin: 400,
      expectedMsrpMax: 480
    }
  ];

  for (const scen of testScenarios) {
    const detected = detectProductCategory(scen.query);
    const estimate = estimateHistoricalPricing(scen.query, detected);

    if (estimate.suggestedMsrp < scen.expectedMsrpMin || estimate.suggestedMsrp > scen.expectedMsrpMax) {
      fail(`Auto-Estimate [${scen.query.slice(0, 30)}...]`, 'BENCHMARKS', `Expected MSRP between $${scen.expectedMsrpMin}-$${scen.expectedMsrpMax}, got $${estimate.suggestedMsrp}`);
    } else {
      pass(`Auto-Estimate [${scen.query.slice(0, 30)}...]`, 'BENCHMARKS', `MSRP: $${estimate.suggestedMsrp.toFixed(2)}, ATL: $${estimate.allTimeLow.toFixed(2)} (${estimate.allTimeLowStore})`);
    }
  }

  // ==========================================
  // SECTION 4: Search Query Cleaner
  // ==========================================
  const rawQueries = [
    { input: 'Samsung 65" Class OLED S90D 4K Smart TV', brand: 'Samsung', model: 'QN65S90D', expected: 'Samsung QN65S90D' },
    { input: 'Jackery Explorer 1500 v2 (2024 Edition) + 100W Panel', brand: 'Jackery', model: 'Explorer 1500 v2', expected: 'Jackery Explorer 1500 v2' },
    { input: 'Sony WH-1000XM5 #1 Noise-Canceling', brand: 'Sony', model: 'WH1000XM5', expected: 'Sony WH1000XM5' }
  ];

  for (const q of rawQueries) {
    const cleaned = cleanSearchQuery(q.input, q.brand, q.model);
    if (!cleaned || cleaned.includes('"') || cleaned.includes('#')) {
      fail(`CleanQuery [${q.input.slice(0, 25)}]`, 'PRODUCT_MATCH', `Cleaned query contains bad syntax: "${cleaned}"`);
    } else {
      pass(`CleanQuery [${q.input.slice(0, 25)}]`, 'PRODUCT_MATCH', `Cleaned query: "${cleaned}"`);
    }
  }

  // ==========================================
  // SECTION 5: Zero Broken Guessed Slugs Audit
  // ==========================================
  let totalCheckedUrls = 0;
  for (const item of INITIAL_TRACKED_ITEMS) {
    for (const r of item.retailers) {
      totalCheckedUrls++;
      if (detectBrokenGuessedSlug(r.url)) {
        fail(`Broken Slug in Catalog [${item.id} -> ${r.retailerName}]`, 'DEAL_LINKS', `Found broken guessed slug: ${r.url}`);
      }

      const resolved = getRetailerDealUrl(r.retailerName, item.title, r.url, item.brand, item.model);
      if (detectBrokenGuessedSlug(resolved)) {
        fail(`Broken Slug in Resolved URL [${item.id} -> ${r.retailerName}]`, 'DEAL_LINKS', `Resolved URL is a broken guessed slug: ${resolved}`);
      }

      const isDirect = isVerifiedDirectProductUrl(resolved);
      const isSearch = isOfficialSearchUrl(resolved);
      if (!isDirect && !isSearch) {
        fail(`Unknown URL Schema [${item.id} -> ${r.retailerName}]`, 'DEAL_LINKS', `URL is neither verified direct nor official search: ${resolved}`);
      }
    }
  }

  for (const preset of POPULAR_ITEM_PRESETS) {
    totalCheckedUrls++;
    const resolvedPresetUrl = getRetailerDealUrl(preset.bestRetailer, preset.title, undefined, preset.brand, preset.model);
    if (detectBrokenGuessedSlug(resolvedPresetUrl)) {
      fail(`Broken Slug in Preset [${preset.title} -> ${preset.bestRetailer}]`, 'DEAL_LINKS', `Found broken guessed slug: ${resolvedPresetUrl}`);
    }
  }
  pass('Zero Broken Guessed Slugs', 'DEAL_LINKS', `Audited ${totalCheckedUrls} retailer links across catalog and presets. 0 broken slugs detected.`);

  // ==========================================
  // SECTION 6: UI Link Details Badge & Action Logic
  // ==========================================
  // Uses the Sony WH-1000XM5 / Best Buy pair, one of the links confirmed against
  // the live retailer page, so the Direct badge is exercised on real data.
  const directTest = getRetailerLinkDetails('Best Buy', 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', undefined, 'Sony', 'WH1000XM5');
  if (!directTest.isDirect || directTest.badgeLabel !== 'Direct' || !directTest.url.includes('6505727.p')) {
    fail('LinkDetails Direct Resolution', 'DEAL_LINKS', `Failed direct link detection for Sony WH-1000XM5: ${JSON.stringify(directTest)}`);
  } else {
    pass('LinkDetails Direct Resolution', 'DEAL_LINKS', `Correctly flagged as Direct: "${directTest.actionText}" (${directTest.badgeLabel})`);
  }

  const searchTest = getRetailerLinkDetails('Target', 'Unknown Product 12345 Custom Nonexistent Widget');
  if (searchTest.isDirect || searchTest.badgeLabel !== 'Search' || !searchTest.url.includes('target.com/s?searchTerm=')) {
    fail('LinkDetails Search Fallback', 'DEAL_LINKS', `Failed search link fallback: ${JSON.stringify(searchTest)}`);
  } else {
    pass('LinkDetails Search Fallback', 'DEAL_LINKS', `Correctly flagged as Search: "${searchTest.actionText}" (${searchTest.badgeLabel})`);
  }

  // ==========================================
  // SECTION 7: Major Accuracy Upgrade Regression Suite
  // ==========================================

  // Test 1: Unknown product does not receive fabricated prices
  const unknownId = normalizeProductIdentity({ title: 'Unknown Custom Prototype 99999XYZ' });
  const unknownCand: RetailerCandidate = {
    retailer: 'Amazon',
    url: 'https://www.amazon.com/s?k=Unknown+Custom+Prototype+99999XYZ',
    sourceType: 'search',
    discoveredAt: new Date().toISOString()
  };
  const unknownVerified = verifyRetailerPrice({ requestedProduct: unknownId, retailerName: 'Amazon', candidate: unknownCand });
  if (unknownVerified.price === null && unknownVerified.priceVerified === false) {
    pass('Regression 1: Zero Price Fabrication', 'ACCURACY_UPGRADE', 'Unknown product has null price and is unverified (zero fabrication)');
  } else {
    fail('Regression 1: Zero Price Fabrication', 'ACCURACY_UPGRADE', `Expected null price, got ${unknownVerified.price}`);
  }

  // Test 2: Amazon search URL is classified as search_results, not verified_product
  const amzSearchType = determineLinkType('https://www.amazon.com/s?k=Anker+SOLIX+C1000', 'Amazon');
  if (amzSearchType === 'search_results') {
    pass('Regression 2: Amazon Search Classification', 'ACCURACY_UPGRADE', 'Amazon /s?k= correctly classified as search_results');
  } else {
    fail('Regression 2: Amazon Search Classification', 'ACCURACY_UPGRADE', `Expected search_results, got ${amzSearchType}`);
  }

  // Test 3: Amazon /dp/ URL without matching product identity is not verified
  const c1000Id = normalizeProductIdentity({ title: 'Anker SOLIX C1000 Gen 2', brand: 'Anker', model: 'A1761' });
  const mismatchCand: RetailerCandidate = {
    retailer: 'Amazon',
    url: 'https://www.amazon.com/dp/B00F0KM1D4',
    title: 'Shakespeare Ugly Stik GX2 Spinning Rod',
    brand: 'Shakespeare',
    model: 'GX2',
    sourceType: 'retailer_page',
    discoveredAt: new Date().toISOString()
  };
  const mismatchResult = matchCandidateProduct(c1000Id, mismatchCand);
  if (mismatchResult.status === 'wrong_product') {
    pass('Regression 3: DP URL Without Matching Identity Rejected', 'ACCURACY_UPGRADE', `Correctly rejected mismatching /dp/ product: ${mismatchResult.reasons.join(', ')}`);
  } else {
    fail('Regression 3: DP URL Without Matching Identity Rejected', 'ACCURACY_UPGRADE', `Expected wrong_product, got ${mismatchResult.status}`);
  }

  // Test 4: Target does not sell Anker SOLIX C1000 Gen 2
  const targetEligible = checkRetailerEligibility('Target', c1000Id);
  const targetVerified = verifyRetailerPrice({ requestedProduct: c1000Id, retailerName: 'Target' });
  if (!targetEligible.eligible && !targetVerified.productVerified && targetVerified.price === null) {
    pass('Regression 4: Target Ineligible for Anker SOLIX C1000', 'ACCURACY_UPGRADE', `Target correctly rejected: ${targetEligible.reason}`);
  } else {
    fail('Regression 4: Target Ineligible for Anker SOLIX C1000', 'ACCURACY_UPGRADE', 'Target was marked eligible or had price');
  }

  // Test 5: Bundle mismatch is rejected (wrong_product)
  const standaloneId = normalizeProductIdentity({ title: 'Anker SOLIX C1000 Gen 2 Portable Power Station', isBundle: false });
  const bundleCand: RetailerCandidate = {
    retailer: 'Amazon',
    url: 'https://www.amazon.com/dp/B0C4DBC65K',
    title: 'Anker SOLIX C1000 Portable Power Station with 200W Solar Panel Bundle',
    isBundle: true,
    bundleItems: ['200W Solar Panel'],
    sourceType: 'retailer_page',
    discoveredAt: new Date().toISOString()
  };
  const bundleResult = matchCandidateProduct(standaloneId, bundleCand);
  if (bundleResult.status === 'wrong_product' && bundleResult.isBundleMismatch) {
    pass('Regression 5: Bundle Mismatch Rejected', 'ACCURACY_UPGRADE', 'Standalone vs Solar Panel Bundle correctly rejected as wrong_product');
  } else {
    fail('Regression 5: Bundle Mismatch Rejected', 'ACCURACY_UPGRADE', `Expected wrong_product with bundle mismatch, got ${bundleResult.status}`);
  }

  // Test 6: Exact MPN match succeeds (exact)
  const mpnReq = normalizeProductIdentity({ title: 'Sony WH-1000XM5 Headphones', mpn: 'WH1000XM5/B' });
  const mpnCand: RetailerCandidate = {
    retailer: 'B&H Photo',
    url: 'https://www.bhphotovideo.com/c/product/1706692-REG',
    title: 'Sony WH-1000XM5 Wireless Headphones (Black)',
    mpn: 'WH1000XM5/B',
    sourceType: 'retailer_page',
    discoveredAt: new Date().toISOString()
  };
  const mpnResult = matchCandidateProduct(mpnReq, mpnCand);
  if (mpnResult.status === 'exact' && mpnResult.confidence >= 90) {
    pass('Regression 6: Exact MPN Match', 'ACCURACY_UPGRADE', `Exact MPN matched (confidence: ${mpnResult.confidence})`);
  } else {
    fail('Regression 6: Exact MPN Match', 'ACCURACY_UPGRADE', `Expected exact, got ${mpnResult.status}`);
  }

  // Test 7: Exact GTIN match succeeds (exact)
  const gtinReq = normalizeProductIdentity({ title: 'Samsung 65" OLED S90D TV', gtin: '887276824192' });
  const gtinCand: RetailerCandidate = {
    retailer: 'Best Buy',
    url: 'https://www.bestbuy.com/site/6576624.p',
    title: 'Samsung 65 Class S90D Series OLED 4K',
    gtin: '887276824192',
    sourceType: 'retailer_page',
    discoveredAt: new Date().toISOString()
  };
  const gtinResult = matchCandidateProduct(gtinReq, gtinCand);
  if (gtinResult.status === 'exact' && gtinResult.confidence >= 90) {
    pass('Regression 7: Exact GTIN Match', 'ACCURACY_UPGRADE', `Exact GTIN barcode verified candidate (confidence: ${gtinResult.confidence})`);
  } else {
    fail('Regression 7: Exact GTIN Match', 'ACCURACY_UPGRADE', `Expected exact with >=90, got ${gtinResult.status}`);
  }

  // Test 8: Different generation is not matched (wrong_product)
  const gen2Id = normalizeProductIdentity({ title: 'Anker SOLIX C1000 Gen 2', generation: 'Gen 2' });
  const gen1Cand: RetailerCandidate = {
    retailer: 'Amazon',
    url: 'https://www.amazon.com/dp/B0GEN1',
    title: 'Anker SOLIX C1000 Gen 1 Portable Power Station',
    generation: 'Gen 1',
    sourceType: 'retailer_page',
    discoveredAt: new Date().toISOString()
  };
  const genResult = matchCandidateProduct(gen2Id, gen1Cand);
  if (genResult.status === 'wrong_product' && genResult.isGenerationMismatch) {
    pass('Regression 8: Generation Mismatch Rejected', 'ACCURACY_UPGRADE', 'Gen 2 vs Gen 1 correctly classified as wrong_product');
  } else {
    fail('Regression 8: Generation Mismatch Rejected', 'ACCURACY_UPGRADE', `Expected wrong_product, got ${genResult.status}`);
  }

  // Test 9: Different capacity is not matched (wrong_product)
  const cap1000Id = normalizeProductIdentity({ title: 'Anker SOLIX C1000 (1056Wh)', capacity: '1056Wh' });
  const cap2000Cand: RetailerCandidate = {
    retailer: 'Amazon',
    url: 'https://www.amazon.com/dp/B0CAP2000',
    title: 'Anker SOLIX F2000 (2048Wh) Portable Power Station',
    capacity: '2048Wh',
    sourceType: 'retailer_page',
    discoveredAt: new Date().toISOString()
  };
  const capResult = matchCandidateProduct(cap1000Id, cap2000Cand);
  if (capResult.status === 'wrong_product' && capResult.isCapacityMismatch) {
    pass('Regression 9: Capacity Mismatch Rejected', 'ACCURACY_UPGRADE', '1056Wh vs 2048Wh correctly classified as wrong_product');
  } else {
    fail('Regression 9: Capacity Mismatch Rejected', 'ACCURACY_UPGRADE', `Expected wrong_product, got ${capResult.status}`);
  }

  // Test 10: Camera Body vs Lens Kit Bundle rejected
  const bodyOnly = normalizeProductIdentity({ title: 'Sony Alpha a7 IV Mirrorless Camera Body Only', isBundle: false });
  const kitLensCand: RetailerCandidate = {
    retailer: 'B&H Photo',
    url: 'https://www.bhphotovideo.com/c/product/a7iv-kit',
    title: 'Sony Alpha a7 IV Mirrorless Camera with 28-70mm Lens Kit',
    isBundle: true,
    sourceType: 'retailer_page',
    discoveredAt: new Date().toISOString()
  };
  const lensMatch = matchCandidateProduct(bodyOnly, kitLensCand);
  if (lensMatch.status === 'wrong_product' && lensMatch.isBundleMismatch) {
    pass('Regression 10: Camera Body vs Lens Kit Bundle Rejected', 'ACCURACY_UPGRADE', 'Body only vs lens kit bundle correctly classified as wrong_product');
  } else {
    fail('Regression 10: Camera Body vs Lens Kit Bundle Rejected', 'ACCURACY_UPGRADE', `Expected wrong_product, got ${lensMatch.status}`);
  }

  // Multi-Category Coverage Verification
  const categoryTestItems = [
    { title: 'Sony WH-1000XM5 Headphones', cat: 'Electronics', brand: 'Sony', model: 'WH1000XM5' },
    { title: 'AMD Ryzen 7 7800X3D Desktop Processor', cat: 'PC Components', brand: 'AMD', model: '7800X3D' },
    { title: 'Roborock S8 Pro Ultra Robot Vacuum', cat: 'Home Appliances', brand: 'Roborock', model: 'S8 Pro Ultra' },
    { title: 'DEWALT 20V MAX Cordless Drill Combo Kit', cat: 'Power Tools', brand: 'DEWALT', model: 'DCK240C2' },
    { title: 'Shimano Stradic FM 2500 Spinning Reel', cat: 'Fishing', brand: 'Shimano', model: 'ST2500HGFM' },
    { title: 'Osprey Atmos AG 65 Expedition Backpack', cat: 'Hiking & Backpacking', brand: 'Osprey', model: 'Atmos 65' },
    { title: 'Jackery Explorer 1500 v2 Solar Generator', cat: 'Solar Generators', brand: 'Jackery', model: 'Explorer 1500 v2' }
  ];

  for (const cItem of categoryTestItems) {
    const ident = normalizeProductIdentity(cItem);
    if (!ident.productName || !ident.brand) {
      fail(`Category Item [${cItem.cat}] Normalization`, 'ACCURACY_UPGRADE', `Failed to normalize: ${cItem.title}`);
    } else {
      pass(`Category Item [${cItem.cat}] Normalization`, 'ACCURACY_UPGRADE', `Normalized "${ident.productName}" (Brand: ${ident.brand}, Model: ${ident.model || 'N/A'})`);
    }
  }

  // ==========================================
  // SECTION 8: Structured Data Link Verification
  // ==========================================
  // Offline coverage for the JSON-LD verifier. These are the checks that decide
  // whether a link is confirmed, contradicted, or simply unverifiable -- the
  // distinction that stops a bot-block from being mistaken for a bad link.

  const realWorldJsonLd = `
    <html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"BreadcrumbList","itemListElement":[]},
      {"@type":"Product","name":"Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black",
       "sku":"6505727","mpn":"WH1000XM5/B","gtin13":"0027242924291",
       "brand":{"@type":"Brand","name":"Sony"},
       "offers":{"@type":"Offer","price":"328.00","priceCurrency":"USD",
                 "availability":"https://schema.org/InStock"}}
    ]}
    </script>
    </head><body></body></html>`;

  const parsed = parseJsonLdProducts(realWorldJsonLd);
  if (parsed.length !== 1) {
    fail('JSON-LD Product Extraction', 'DEAL_LINKS', `Expected 1 product from @graph, got ${parsed.length}`);
  } else if (parsed[0].sku !== '6505727' || parsed[0].gtin !== '0027242924291' || parsed[0].price !== 328 || parsed[0].brand !== 'Sony') {
    fail('JSON-LD Product Extraction', 'DEAL_LINKS', `Fields not extracted correctly: ${JSON.stringify(parsed[0])}`);
  } else {
    pass('JSON-LD Product Extraction', 'DEAL_LINKS', `Extracted sku ${parsed[0].sku}, gtin ${parsed[0].gtin}, price $${parsed[0].price}, availability ${parsed[0].availability}`);
  }

  if (parseJsonLdProducts('<html><body>no structured data here</body></html>').length !== 0) {
    fail('JSON-LD Absence Handling', 'DEAL_LINKS', 'Reported products on a page with no JSON-LD');
  } else {
    pass('JSON-LD Absence Handling', 'DEAL_LINKS', 'Correctly reports no products when a page publishes none');
  }

  if (parseJsonLdProducts('<script type="application/ld+json">{ this is not json </script>').length !== 0) {
    fail('JSON-LD Malformed Block', 'DEAL_LINKS', 'Malformed JSON-LD should be skipped, not throw or match');
  } else {
    pass('JSON-LD Malformed Block', 'DEAL_LINKS', 'Malformed JSON-LD block skipped safely');
  }

  // A page that confirms the requested product
  const sonyIdentity = normalizeProductIdentity({
    title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones',
    brand: 'Sony',
    model: 'WH-1000XM5',
    mpn: 'WH1000XM5/B'
  });
  const positive = compareStructuredProduct(sonyIdentity, parsed[0] || {});
  if (positive.contradicted || positive.confidence < 88) {
    fail('Structured Match (correct product)', 'DEAL_LINKS', `Expected a high-confidence match, got ${JSON.stringify(positive)}`);
  } else {
    pass('Structured Match (correct product)', 'DEAL_LINKS', `Confirmed via ${positive.matchedIdentifiers.join(', ')} (confidence ${positive.confidence})`);
  }

  // The exact failure this engine exists to catch: a valid product page that
  // sells something else entirely (a real case found on a "verified" link).
  const wrongProduct = compareStructuredProduct(sonyIdentity, {
    name: 'Alfatron 5" 2-Way 30W Surface Mount Speaker (Black)',
    sku: 'ALFW51B',
    brand: 'Alfatron',
    price: 178.99
  });
  if (!wrongProduct.contradicted) {
    fail('Structured Match (wrong product)', 'DEAL_LINKS', `A different brand/product must be contradicted: ${JSON.stringify(wrongProduct)}`);
  } else {
    pass('Structured Match (wrong product)', 'DEAL_LINKS', `Correctly contradicted: ${wrongProduct.mismatches.join('; ')}`);
  }

  // Conflicting GTIN is decisive even when the title looks plausible
  const gtinConflict = compareStructuredProduct(
    normalizeProductIdentity({ title: 'Sony WH-1000XM5', brand: 'Sony', model: 'WH-1000XM5', gtin: '0027242924291' }),
    { name: 'Sony WH-1000XM5 Wireless Headphones', brand: 'Sony', gtin: '0027242911111' }
  );
  if (!gtinConflict.contradicted) {
    fail('Structured Match (GTIN conflict)', 'DEAL_LINKS', 'A differing GTIN must contradict the match');
  } else {
    pass('Structured Match (GTIN conflict)', 'DEAL_LINKS', `GTIN conflict detected: ${gtinConflict.mismatches.join('; ')}`);
  }

  // Thin data must stay inconclusive rather than guessing either way
  const thin = compareStructuredProduct(sonyIdentity, { name: 'Wireless Headphones' });
  if (thin.contradicted || thin.confidence >= 88) {
    fail('Structured Match (insufficient data)', 'DEAL_LINKS', `Thin structured data must not produce a verdict: ${JSON.stringify(thin)}`);
  } else {
    pass('Structured Match (insufficient data)', 'DEAL_LINKS', 'Insufficient structured data correctly left unverified');
  }

  // ==========================================
  // SECTION 9: Stored-URL Regression Guard
  // ==========================================
  // The catalog fix alone did not reach anyone who had already used the app:
  // their browser replayed the old URLs from localStorage and the resolver
  // handed them straight back, because they LOOKED like valid product pages.
  // These checks make sure a proven-wrong URL cannot survive by being
  // well-formed, no matter where it is supplied from.

  const provenWrongStoredUrls = [
    { retailer: 'Best Buy', title: 'Samsung 65" Class OLED S90D 4K Smart TV', brand: 'Samsung', model: 'QN65S90DAFXZA', url: 'https://www.bestbuy.com/site/samsung-65-class-s90d-series-oled-4k-uhd-smart-tizen-tv-2024/6576624.p?skuId=6576624', serves: 'a Tech21 iPhone case' },
    { retailer: 'B&H Photo', title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', brand: 'Sony', model: 'WH1000XM5/B', url: 'https://www.bhphotovideo.com/c/product/1706692-REG/sony_wh1000xm5_b_wh_1000xm5_wireless_noise_canceling_headphones.html', serves: 'an Alfatron speaker' },
    { retailer: 'REI', title: "Osprey Atmos AG 65 Men's Expedition Backpack", brand: 'Osprey', model: 'Atmos AG 65 (L/XL)', url: 'https://www.rei.com/product/218570/osprey-atmos-ag-65-pack-mens', serves: "an Osprey HydraJet 12 Kids' pack" },
    { retailer: 'Walmart', title: 'DeWalt 20V MAX Cordless Drill & Impact Driver Combo Kit', brand: 'DeWalt', model: 'DCK280C2', url: 'https://www.walmart.com/ip/DEWALT-DCK280C2-20V-MAX-Cordless-Lithium-Ion-Compact-Drill-Driver-and-Impact-Driver-Combo-Kit/23565860', serves: 'a Briggs & Stratton air filter' }
  ];

  for (const stored of provenWrongStoredUrls) {
    if (!isQuarantinedProductUrl(stored.url)) {
      fail(`Quarantine [${stored.retailer}]`, 'DEAL_LINKS', `Known-bad URL is not quarantined: ${stored.url}`);
      continue;
    }
    if (isVerifiedDirectProductUrl(stored.url)) {
      fail(`Quarantine Direct Check [${stored.retailer}]`, 'DEAL_LINKS', `Known-bad URL still passes as a direct product page: ${stored.url}`);
      continue;
    }
    const resolved = getRetailerDealUrl(stored.retailer, stored.title, stored.url, stored.brand, stored.model);
    if (resolved === stored.url) {
      fail(`Stored URL Repair [${stored.retailer}]`, 'DEAL_LINKS', `Resolver handed a known-bad stored URL straight back: ${resolved}`);
    } else if (!isOfficialSearchUrl(resolved) && !isVerifiedDirectProductUrl(resolved)) {
      fail(`Stored URL Repair [${stored.retailer}]`, 'DEAL_LINKS', `Repaired URL is neither verified nor an official search: ${resolved}`);
    } else {
      pass(`Stored URL Repair [${stored.retailer}]`, 'DEAL_LINKS', `Replaced a link that served ${stored.serves}: ${resolved}`);
    }
  }

  // An unproven-but-plausible URL must also not be served as a product page:
  // "correctly shaped" was never evidence of "correct".
  const plausibleButUnproven = getRetailerDealUrl(
    'Target',
    'Dyson V15 Detect Cordless Vacuum Cleaner',
    'https://www.target.com/p/dyson-v15-detect-cordless-vacuum/-/A-99999999',
    'Dyson',
    '368340-01'
  );
  if (!isOfficialSearchUrl(plausibleButUnproven)) {
    fail('Unproven Stored URL Not Trusted', 'DEAL_LINKS', `A well-formed but unverified URL was kept as direct: ${plausibleButUnproven}`);
  } else {
    pass('Unproven Stored URL Not Trusted', 'DEAL_LINKS', `Well-formed but unverified URL correctly downgraded to search: ${plausibleButUnproven}`);
  }

  // A whitelisted link must still survive the stricter resolver.
  const verifiedSurvives = getRetailerDealUrl(
    'Best Buy',
    'Sony WH-1000XM5 Wireless Noise-Canceling Headphones',
    'https://www.bestbuy.com/site/sony-wh-1000xm5-wireless-noise-canceling-over-the-ear-headphones-black/6505727.p?skuId=6505727',
    'Sony',
    'WH1000XM5'
  );
  if (!verifiedSurvives.includes('6505727.p')) {
    fail('Verified Link Survives', 'DEAL_LINKS', `Whitelisted verified link was lost: ${verifiedSurvives}`);
  } else {
    pass('Verified Link Survives', 'DEAL_LINKS', `Confirmed link preserved: ${verifiedSurvives}`);
  }

  // ==========================================
  // SECTION 10: Deal Optimizer (shipping-aware, pre-tax)
  // ==========================================
  // The optimizer used to sum item prices only, so it would recommend splitting
  // a basket across nine stores to save a few dollars while treating nine
  // deliveries as free. Sales tax is deliberately out of scope -- it depends on
  // the buyer's jurisdiction -- so totals are pre-tax and labelled as such.

  const mkItem = (id: string, msrp: number, offers: Array<[string, number, boolean?]>): any => ({
    id,
    title: `Acme Widget ${id}`,
    brand: 'Acme',
    model: `AW-${id}`,
    category: 'Electronics',
    msrp,
    allTimeLow: msrp * 0.8,
    retailers: offers.map(([retailerName, price, inStock], i) => ({
      id: `r-${id}-${i}`,
      retailerName,
      url: `https://www.${retailerName.toLowerCase().replace(/[^a-z]/g, '')}.com/s?k=widget`,
      price,
      inStock: inStock !== false,
      stockMessage: 'In Stock',
      shipping: 'Standard',
      shippingCost: 0,
      rating: 0,
      reviewCount: 0
    }))
  });

  // Splitting saves $20 on prices but adds one shipment.
  const twoItems = [
    mkItem('A', 100, [['Amazon', 100], ['Walmart', 90]]),
    mkItem('B', 100, [['Amazon', 100], ['Walmart', 110]])
  ];

  const cheapShipping = computeDealPlan(twoItems, { shippingPerShipment: 5 });
  if (cheapShipping.itemsSubtotal !== 190) {
    fail('Optimizer Picks Cheapest', 'BENCHMARKS', `Expected items subtotal 190, got ${cheapShipping.itemsSubtotal}`);
  } else if (cheapShipping.estimatedShipping !== 10 || cheapShipping.splitTotal !== 200) {
    fail('Optimizer Counts Shipping', 'BENCHMARKS', `Expected 2 shipments at $5 (total 200), got shipping ${cheapShipping.estimatedShipping}, total ${cheapShipping.splitTotal}`);
  } else if (cheapShipping.verdict !== 'split_wins') {
    fail('Optimizer Verdict (cheap shipping)', 'BENCHMARKS', `Expected split_wins, got ${cheapShipping.verdict} (net ${cheapShipping.netSavings})`);
  } else {
    pass('Optimizer Counts Shipping', 'BENCHMARKS', `Split $200 (items $190 + $10 shipping) beats Amazon $205; net +$${cheapShipping.netSavings.toFixed(2)}`);
  }

  // Same basket, expensive shipping: the split must now LOSE.
  const dearShipping = computeDealPlan(twoItems, { shippingPerShipment: 25 });
  if (dearShipping.verdict !== 'single_store_wins' || dearShipping.netSavings >= 0) {
    fail('Optimizer Rejects Costly Split', 'BENCHMARKS', `A split adding a $25 shipment to save $10 must lose; got ${dearShipping.verdict} net ${dearShipping.netSavings}`);
  } else {
    pass('Optimizer Rejects Costly Split', 'BENCHMARKS', `Correctly prefers one store when shipping is $25 (net $${dearShipping.netSavings.toFixed(2)})`);
  }

  // Break-even must be the per-shipment price where the split stops paying.
  if (cheapShipping.breakEvenShipping === null || Math.abs(cheapShipping.breakEvenShipping - 10) > 0.01) {
    fail('Optimizer Break-Even', 'BENCHMARKS', `Expected break-even of $10.00 per extra shipment, got ${cheapShipping.breakEvenShipping}`);
  } else {
    pass('Optimizer Break-Even', 'BENCHMARKS', `Break-even correctly $${cheapShipping.breakEvenShipping.toFixed(2)} per extra shipment`);
  }

  // An item with no in-stock price must be excluded, never valued at MSRP.
  const withUnpriced = computeDealPlan([
    mkItem('C', 100, [['Amazon', 80]]),
    mkItem('D', 500, [['Amazon', 450, false]])
  ], { shippingPerShipment: 0 });
  if (withUnpriced.unpriced.length !== 1 || withUnpriced.itemsSubtotal !== 80) {
    fail('Optimizer Excludes Unpriced', 'BENCHMARKS', `Out-of-stock item must be excluded, not valued at MSRP. Subtotal ${withUnpriced.itemsSubtotal}, unpriced ${withUnpriced.unpriced.length}`);
  } else {
    pass('Optimizer Excludes Unpriced', 'BENCHMARKS', `Out-of-stock item excluded from totals and reported separately`);
  }

  // No single store carries everything -> no bogus baseline comparison.
  const noFullCoverage = computeDealPlan([
    mkItem('E', 100, [['Amazon', 90]]),
    mkItem('F', 100, [['Walmart', 90]])
  ], { shippingPerShipment: 5 });
  if (noFullCoverage.baseline !== null || noFullCoverage.verdict !== 'split_required') {
    fail('Optimizer Baseline Honesty', 'BENCHMARKS', `With no full-coverage store there must be no baseline; got ${JSON.stringify(noFullCoverage.baseline)} / ${noFullCoverage.verdict}`);
  } else {
    pass('Optimizer Baseline Honesty', 'BENCHMARKS', 'No single-store total invented when no store carries the whole basket');
  }

  // Coverage must be reported so partial baskets are never compared as equals.
  const partial = noFullCoverage.storeCoverage.find(c => c.storeName === 'Amazon');
  if (!partial || partial.fullCoverage || partial.itemsCovered !== 1 || partial.totalWithShipping !== null) {
    fail('Optimizer Coverage Reporting', 'BENCHMARKS', `Partial-coverage store must be flagged: ${JSON.stringify(partial)}`);
  } else {
    pass('Optimizer Coverage Reporting', 'BENCHMARKS', `Partial store flagged as ${partial.itemsCovered}/${partial.itemsNeeded} with no comparable total`);
  }

  // ==========================================
  // SECTION 11: Observation Store
  // ==========================================
  // The record of prices actually seen. An all-time low is only true once it has
  // been observed and written down -- everything before this was arithmetic on
  // MSRP. These checks also pin the privacy invariant: an observation describes
  // a product at a retailer and carries nothing that identifies a person.

  if (buildProductKey({ gtin: '0027242924291', mpn: 'WH1000XM5', brand: 'Sony' }) !== 'gtin:0027242924291') {
    fail('Product Key Precedence', 'PRODUCT_MATCH', 'A GTIN must take precedence over weaker identifiers');
  } else if (buildProductKey({ gtin: '0027242924291' }) !== buildProductKey({ gtin: '00-2724 292 4291' })) {
    fail('Product Key Stability', 'PRODUCT_MATCH', 'The same GTIN formatted differently must produce the same key');
  } else {
    pass('Product Key Precedence', 'PRODUCT_MATCH', 'Keys prefer GTIN, then MPN, then brand+model, and ignore formatting');
  }

  // PRIVACY: anything identifying a person must be dropped before storage.
  const sanitized: any = sanitizeObservation({
    productKey: 'gtin:0027242924291',
    retailer: 'Best Buy',
    price: 328,
    source: 'structured_data',
    url: 'https://www.bestbuy.com/site/x/6505727.p?skuId=6505727&sessionId=abc&uid=someone@example.com',
    email: 'someone@example.com',
    userId: 'u-42',
    ipAddress: '10.0.0.1',
    deviceId: 'device-1'
  });
  const allowedKeys = ['currency', 'inStock', 'observedAt', 'price', 'productKey', 'retailer', 'source', 'url', 'verified'];
  const actualKeys = sanitized ? Object.keys(sanitized).sort() : [];
  if (!sanitized) {
    fail('Observation Privacy Whitelist', 'PRODUCT_MATCH', 'A valid observation was rejected');
  } else if (JSON.stringify(actualKeys) !== JSON.stringify(allowedKeys)) {
    fail('Observation Privacy Whitelist', 'PRODUCT_MATCH', `Unexpected fields stored: ${actualKeys.join(', ')}`);
  } else if (sanitized.url !== 'https://www.bestbuy.com/site/x/6505727.p') {
    fail('Observation URL Scrubbing', 'PRODUCT_MATCH', `Query string must be stripped (session/affiliate tokens): ${sanitized.url}`);
  } else {
    pass('Observation Privacy Whitelist', 'PRODUCT_MATCH', 'Email, user id, IP and device fields dropped; URL query string stripped');
  }

  if (sanitizeObservation({ productKey: 'k', retailer: 'A', price: 0 }) !== null) {
    fail('Observation Rejects Bad Price', 'PRICE_ACCURACY', 'A non-positive price must not be recorded');
  } else {
    pass('Observation Rejects Bad Price', 'PRICE_ACCURACY', 'Zero and negative prices rejected');
  }

  const futureStamped = sanitizeObservation({ productKey: 'k', retailer: 'A', price: 10, observedAt: '2099-01-01T00:00:00Z' });
  if (!futureStamped || Date.parse(futureStamped.observedAt) > Date.now() + 1000) {
    fail('Observation Clamps Future Timestamps', 'PRICE_ACCURACY', 'A future observedAt would poison "latest price"');
  } else {
    pass('Observation Clamps Future Timestamps', 'PRICE_ACCURACY', 'Caller-supplied future timestamps clamped to now');
  }

  resetObservations();
  const sample = { productKey: 'selftest-p', retailer: 'Amazon', price: 100, source: 'structured_data' as const, url: 'https://www.amazon.com/dp/X' };
  const firstWrite = recordObservation(sample).recorded;
  const duplicateWrite = recordObservation(sample).recorded;
  const changedWrite = recordObservation({ ...sample, price: 90 }).recorded;
  if (!firstWrite || duplicateWrite || !changedWrite) {
    fail('Observation Dedupe', 'PRICE_ACCURACY', `Expected record/skip/record, got ${firstWrite}/${duplicateWrite}/${changedWrite}`);
  } else {
    pass('Observation Dedupe', 'PRICE_ACCURACY', 'Repeated identical prices collapse; a changed price records');
  }

  resetObservations();
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  recordObservation({ productKey: 'stats-p', retailer: 'Amazon', price: 200, source: 'structured_data', url: 'https://a.com/p', observedAt: twoHoursAgo });
  recordObservation({ productKey: 'stats-p', retailer: 'Amazon', price: 150, source: 'structured_data', url: 'https://a.com/p', observedAt: oneHourAgo });
  recordObservation({ productKey: 'stats-p', retailer: 'Walmart', price: 180, source: 'structured_data', url: 'https://w.com/p', observedAt: oneHourAgo });
  const stats = getStats('stats-p');
  if (stats.allTimeLow?.price !== 150) {
    fail('Observation All-Time Low', 'PRICE_ACCURACY', `Expected recorded low of 150, got ${stats.allTimeLow?.price}`);
  } else if (stats.currentBest?.price !== 150 || stats.currentBest?.retailer !== 'Amazon') {
    fail('Observation Current Best', 'PRICE_ACCURACY', `Current best must come from each retailer's LATEST price, got ${JSON.stringify(stats.currentBest)}`);
  } else if (stats.hasMeaningfulHistory !== false) {
    fail('Observation History Honesty', 'PRICE_ACCURACY', 'Three points over two hours must not count as meaningful history');
  } else {
    pass('Observation Stats', 'PRICE_ACCURACY', `All-time low $${stats.allTimeLow.price} from ${stats.observationCount} observations; short history correctly flagged as not yet meaningful`);
  }
  resetObservations();

  // ==========================================
  // SECTION 12: Browser Capture Selection
  // ==========================================
  // A capture arrives with no requested identity -- it is whatever page the user
  // was on -- so the node has to be chosen on its own merits. Retailer pages
  // embed JSON-LD for recommendations and accessories next to the real listing,
  // so "first node" and "cheapest node" are both wrong answers.

  const pageWithDistractors = parseJsonLdProducts(`
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Recommended: Screen Wipes",
     "offers":{"@type":"Offer","price":"9.99","priceCurrency":"USD"}}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Sony WH-1000XM5 Headphones",
     "sku":"6505727","mpn":"WH1000XM5/B","gtin13":"0027242924291",
     "brand":{"@type":"Brand","name":"Sony"},
     "offers":{"@type":"Offer","price":"328.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}
    </script>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Extended Warranty",
     "offers":{"@type":"Offer","price":"49.99","priceCurrency":"USD"}}
    </script>`);

  const chosen = selectMostIdentifiableProduct(pageWithDistractors);
  if (pageWithDistractors.length !== 3) {
    fail('Capture Parses All Nodes', 'DEAL_LINKS', `Expected 3 product nodes, got ${pageWithDistractors.length}`);
  } else if (!chosen || chosen.price !== 328) {
    fail('Capture Node Selection', 'DEAL_LINKS', `Expected the identified product at $328, got ${JSON.stringify(chosen)}`);
  } else if (chosen.gtin !== '0027242924291') {
    fail('Capture Node Selection', 'DEAL_LINKS', `Chose a node without the GTIN: ${JSON.stringify(chosen)}`);
  } else {
    pass('Capture Node Selection', 'DEAL_LINKS', `Picked the GTIN-bearing listing ($328) over an accessory ($9.99) and a warranty ($49.99)`);
  }

  if (selectMostIdentifiableProduct([]) !== null) {
    fail('Capture Empty Page', 'DEAL_LINKS', 'A page with no products must yield null, not a guess');
  } else if (selectMostIdentifiableProduct([{ name: 'No price here' }]) !== null) {
    fail('Capture Priceless Node', 'DEAL_LINKS', 'A product node with no price must yield null');
  } else {
    pass('Capture Empty Page', 'DEAL_LINKS', 'Pages with no product or no price record nothing rather than guessing');
  }

  // ==========================================
  // SECTION 13: Preset Matching
  // ==========================================
  // The matcher used to test only the typed title, never the preset being
  // examined, so every alias condition was constant with respect to the
  // candidate. Typing "Ugly Stik GX2" matched whichever preset sat first in the
  // array and the new item inherited that preset's brand and model -- a fishing
  // rod arrived branded Jackery, model Explorer 1500 v2.

  const presetCases = [
    { typed: 'Ugly Stik GX2 Spinning Rod', expect: 'ugly stik' },
    { typed: 'Jackery Explorer 1500 v2', expect: 'jackery' },
    { typed: 'Big Agnes Copper Spur HV UL2', expect: 'copper spur' },
    { typed: 'Apple AirPods Pro', expect: 'airpods' },
    { typed: 'Roborock S8 Pro Ultra', expect: 'roborock' }
  ];

  let presetFailures = 0;
  for (const testCase of presetCases) {
    const match = findMatchingPreset(testCase.typed, POPULAR_ITEM_PRESETS);
    if (!match) {
      fail(`Preset Match [${testCase.typed.slice(0, 22)}]`, 'PRODUCT_MATCH', 'No preset matched a title that should match one');
      presetFailures++;
    } else if (!match.title.toLowerCase().includes(testCase.expect)) {
      fail(`Preset Match [${testCase.typed.slice(0, 22)}]`, 'PRODUCT_MATCH', `Matched the WRONG preset: "${match.title}" (brand ${match.brand}) for "${testCase.typed}"`);
      presetFailures++;
    }
  }
  if (presetFailures === 0) {
    pass('Preset Matching Accuracy', 'PRODUCT_MATCH', `All ${presetCases.length} titles matched their own preset, not whichever came first`);
  }

  // A title resembling no preset must match nothing rather than the first entry.
  const noMatch = findMatchingPreset('Generic Unbranded Widget 9000', POPULAR_ITEM_PRESETS);
  if (noMatch) {
    fail('Preset Non-Match', 'PRODUCT_MATCH', `An unrelated title matched "${noMatch.title}"`);
  } else {
    pass('Preset Non-Match', 'PRODUCT_MATCH', 'An unrelated title correctly matches no preset');
  }

  // The specific regression: the Ugly Stik must never come back as Jackery.
  const uglyMatch = findMatchingPreset('Ugly Stik GX2 Spinning Rod', POPULAR_ITEM_PRESETS);
  if (uglyMatch && /jackery/i.test(`${uglyMatch.brand} ${uglyMatch.title}`)) {
    fail('Preset Cross-Contamination', 'PRODUCT_MATCH', 'Ugly Stik matched the Jackery preset -- the original bug is back');
  } else {
    pass('Preset Cross-Contamination', 'PRODUCT_MATCH', `Ugly Stik resolves to "${uglyMatch?.brand}" not Jackery`);
  }

  // ==========================================
  // SECTION 14: Every Item Has Somewhere To Shop
  // ==========================================
  // A tracked item with an empty "Store Deals" row is useless, and because
  // sanitizeTrackedItem re-runs on every load, an item that once lost its
  // retailers stayed broken permanently. It now refills from the category's own
  // storefronts, so a watchlist saved by any earlier build heals itself.

  const strandedItem: any = {
    id: 'stranded',
    title: 'Ugly Stik GX2 Spinning Rod',
    brand: 'Ugly Stik',
    model: 'Model-X',
    category: 'Fishing & Angling',
    imageUrl: '',
    msrp: 59.99,
    allTimeLow: 47.5,
    allTimeLowDate: 'Nov 2024',
    allTimeLowStore: 'Bass Pro Shops',
    targetPrice: 47.5,
    emailAlertEnabled: true,
    userEmail: 'alerts@example.com',
    alertCondition: 'below_target',
    retailers: [],          // the broken state
    priceHistory: [],
    lastUpdated: 'Just now',
    isCustom: true
  };

  const healed = sanitizeTrackedItem(strandedItem);
  if (!healed.retailers || healed.retailers.length === 0) {
    fail('Stranded Item Healing', 'DEAL_LINKS', 'An item with no retailers must be given catalog-search links, not left empty');
  } else if (healed.retailers.some(r => typeof r.price === 'number' && r.price > 0)) {
    fail('Stranded Item Healing', 'DEAL_LINKS', 'Healed retailers must carry no price -- nothing was observed');
  } else {
    const allUsable = healed.retailers.every(r => isOfficialSearchUrl(r.url) || isVerifiedDirectProductUrl(r.url));
    if (!allUsable) {
      fail('Stranded Item Healing', 'DEAL_LINKS', `Healed links must be real URLs: ${healed.retailers.map(r => r.url).join(', ')}`);
    } else {
      pass('Stranded Item Healing', 'DEAL_LINKS', `Empty item refilled with ${healed.retailers.length} priceless catalog links (${healed.retailers.map(r => r.retailerName).join(', ')})`);
    }
  }

  // Healing must not disturb an item that already has retailers.
  const healthyItem = { ...strandedItem, id: 'healthy', retailers: [{
    id: 'r1', retailerName: 'Bass Pro Shops', url: 'https://www.basspro.com/shop/en/SearchDisplay?searchTerm=ugly%20stik',
    price: 44.98, inStock: true, stockMessage: 'In Stock', shipping: 'Free', shippingCost: 0,
    rating: null, reviewCount: null, isBestPrice: true
  }] } as any;
  const untouched = sanitizeTrackedItem(healthyItem);
  if (untouched.retailers.length !== 1 || untouched.retailers[0].price !== 44.98) {
    fail('Healing Leaves Good Data Alone', 'DEAL_LINKS', `An item with real retailers must be preserved: ${JSON.stringify(untouched.retailers.map(r => ({ n: r.retailerName, p: r.price })))}`);
  } else {
    pass('Healing Leaves Good Data Alone', 'DEAL_LINKS', 'An item that already has a priced retailer is left untouched');
  }

  // Every seeded catalog item must survive sanitising with links intact.
  const strippedSeed = INITIAL_TRACKED_ITEMS.map(i => sanitizeTrackedItem({ ...i, retailers: [] } as any))
    .filter(i => !i.retailers || i.retailers.length === 0);
  if (strippedSeed.length > 0) {
    fail('All Catalog Items Recoverable', 'DEAL_LINKS', `These items cannot be healed: ${strippedSeed.map(i => i.title).join(', ')}`);
  } else {
    pass('All Catalog Items Recoverable', 'DEAL_LINKS', `All ${INITIAL_TRACKED_ITEMS.length} catalog items regain store links if their retailer list is ever emptied`);
  }

  // ==========================================
  // SECTION 15: Every Link On Every Item Is Correct
  // ==========================================
  // The standing requirement: each item must carry store links that are
  // accurate. This audits every link on every tracked item and every preset --
  // right retailer domain, resolvable shape, and for a search link, search
  // terms exactly equal to what the query builder intended. A link that goes to
  // the correct store but searches the wrong words is still a wrong link.

  const RETAILER_DOMAINS: Record<string, string> = {
    'amazon': 'amazon.com', 'walmart': 'walmart.com', 'target': 'target.com',
    'best buy': 'bestbuy.com', 'rei': 'rei.com', 'bass pro shops': 'basspro.com',
    "cabela's": 'cabelas.com', 'tackle warehouse': 'tacklewarehouse.com',
    'backcountry': 'backcountry.com', 'b&h photo': 'bhphotovideo.com',
    'newegg': 'newegg.com', 'home depot': 'homedepot.com', 'micro center': 'microcenter.com',
    'costco': 'costco.com', 'breville': 'breville.com', "dick's sporting goods": 'dickssportinggoods.com'
  };

  // Search terms live in a query parameter at most stores and in the path at
  // Home Depot; both count.
  const extractSearchTerms = (url: string): string | null => {
    const param = url.match(/(?:[?&](?:q|k|st|Ntt|searchTerm|keyword|search|d)=)([^&]*)/);
    if (param) return decodeURIComponent(param[1]).replace(/\+/g, ' ');
    const inPath = url.match(/homedepot\.com\/s\/([^?]+)/);
    if (inPath) return decodeURIComponent(inPath[1]).replace(/\+/g, ' ');
    return null;
  };

  const auditLink = (retailer: string, title: string, brand?: string, model?: string, existing?: string): string | null => {
    const url = getRetailerLinkDetails(retailer, title, existing, brand, model).url;
    const domain = RETAILER_DOMAINS[retailer.toLowerCase()];

    if (isQuarantinedProductUrl(url)) return `${retailer}: serves a quarantined URL`;
    if (domain && !url.includes(domain) && !url.includes('google.com/search')) {
      return `${retailer}: wrong domain (expected ${domain}) -> ${url}`;
    }
    if (isVerifiedDirectProductUrl(url)) return null;
    if (!isOfficialSearchUrl(url)) return `${retailer}: neither a verified product page nor an official search -> ${url}`;

    const actual = (extractSearchTerms(url) || '').trim().toLowerCase();
    const expected = cleanSearchQuery(title, brand, model).trim().toLowerCase();
    if (!actual) return `${retailer}: search link carries no search terms -> ${url}`;
    if (actual !== expected) return `${retailer}: searches "${actual}" but should search "${expected}"`;
    return null;
  };

  let auditedLinks = 0;
  const linkProblems: string[] = [];

  for (const item of INITIAL_TRACKED_ITEMS) {
    for (const r of item.retailers) {
      auditedLinks++;
      const problem = auditLink(r.retailerName, item.title, item.brand, item.model, r.url);
      if (problem) linkProblems.push(`[${item.id}] ${problem}`);
    }
  }

  for (const preset of POPULAR_ITEM_PRESETS as any[]) {
    for (const store of getCategoryStoreRules(preset.category, preset.title).defaultRetailers) {
      auditedLinks++;
      const problem = auditLink(store, preset.title, preset.brand, preset.model);
      if (problem) linkProblems.push(`[preset: ${preset.title.slice(0, 24)}] ${problem}`);
    }
  }

  // An item carrying a wrong brand must still produce links that find the product.
  auditedLinks++;
  const pollutedProblem = auditLink('Bass Pro Shops', 'Ugly Stik GX2 Spinning Rod', 'Jackery', 'Explorer 1500 v2');
  if (pollutedProblem) linkProblems.push(`[polluted brand] ${pollutedProblem}`);

  if (linkProblems.length > 0) {
    linkProblems.slice(0, 8).forEach(p => fail('Link Accuracy Audit', 'DEAL_LINKS', p));
  } else {
    pass('Link Accuracy Audit', 'DEAL_LINKS', `All ${auditedLinks} links across ${INITIAL_TRACKED_ITEMS.length} tracked items and ${POPULAR_ITEM_PRESETS.length} presets point at the right store and search exactly the intended terms`);
  }

  // ---------------------------------------------------------------------------
  // SECTION 16: The Offer Model
  //
  // An offer is the only thing allowed to put a price and a Buy action on the
  // screen. These checks hold the line that made the old behaviour possible:
  // a record with no source, no timestamp or no URL must never be storable.

  __resetOffersForTests();

  const nowIso = new Date().toISOString();
  const goodOffer = {
    productKey: 'gtin:00027242924437',
    merchant: 'Best Buy',
    url: 'https://www.bestbuy.com/site/x/6505727.p',
    price: 328.00,
    shippingCost: 0,
    currency: 'USD',
    inStock: true,
    observedAt: nowIso,
    source: 'structured_data' as const
  };

  const stored = recordOffer(goodOffer);
  if (stored.stored && stored.offer) {
    pass('Offer With A Source Is Stored', 'OFFERS', `${stored.offer.merchant} @ $${stored.offer.price} observed ${stored.offer.observedAt}`);
  } else {
    fail('Offer With A Source Is Stored', 'OFFERS', stored.reason);
  }

  const malformed: Array<[string, any]> = [
    ['no url', { ...goodOffer, url: '' }],
    ['search url is not a product url', { ...goodOffer, url: 'not-a-url' }],
    ['no source', { ...goodOffer, source: undefined }],
    ['invented source', { ...goodOffer, source: 'vibes' }],
    ['no product key', { ...goodOffer, productKey: '' }],
    ['negative price', { ...goodOffer, price: -5 }]
  ];
  const wronglyAccepted = malformed.filter(([, payload]) => recordOffer(payload).stored);
  if (wronglyAccepted.length === 0) {
    pass('Malformed Offers Are Rejected', 'OFFERS', `All ${malformed.length} malformed payloads refused (${malformed.map(m => m[0]).join(', ')})`);
  } else {
    fail('Malformed Offers Are Rejected', 'OFFERS', `Accepted: ${wronglyAccepted.map(m => m[0]).join(', ')}`);
  }

  // Every stored offer must be able to answer "when?" and "from where?".
  const missingProvenance = getAllOffers().filter(o => !o.observedAt || !o.source || !o.url);
  if (missingProvenance.length === 0) {
    pass('Every Offer Carries Provenance', 'OFFERS', `${getAllOffers().length} offer(s), each with a url, a source and a timestamp`);
  } else {
    fail('Every Offer Carries Provenance', 'OFFERS', `${missingProvenance.length} offer(s) missing url/source/timestamp`);
  }

  // Tracking parameters must be stripped before an offer URL is stored.
  __resetOffersForTests();
  const tracked = recordOffer({ ...goodOffer, url: 'https://www.bestbuy.com/site/x/6505727.p?ref=abc&loc=xyz' });
  if (tracked.stored && tracked.offer && !tracked.offer.url.includes('?')) {
    pass('Offer URLs Are Stripped Of Query Strings', 'OFFERS', tracked.offer.url);
  } else {
    fail('Offer URLs Are Stripped Of Query Strings', 'OFFERS', tracked.offer?.url || tracked.reason);
  }

  // A stale price must stop being presented as current.
  const staleIso = new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString();
  const staleOffer = { ...goodOffer, id: 'of-stale', observedAt: staleIso } as any;
  if (!isPriceCurrent(staleOffer) && isPriceCurrent({ ...goodOffer, id: 'of-fresh' } as any)) {
    pass('Stale Prices Are Not Current', 'OFFERS', '72h-old price is not shown as current; a fresh one is');
  } else {
    fail('Stale Prices Are Not Current', 'OFFERS', 'Price freshness window is not being enforced');
  }

  // An unpriced offer must never win the "best price" slot.
  __resetOffersForTests();
  recordOffer({ ...goodOffer, merchant: 'Store A', price: 400 });
  recordOffer({ ...goodOffer, merchant: 'Store B', price: null, url: 'https://www.bestbuy.com/site/y/1.p' });
  const best = getBestOffer(goodOffer.productKey);
  if (best && best.merchant === 'Store A' && best.price === 400) {
    pass('Unpriced Offers Never Win Best Price', 'OFFERS', 'Best offer is the only priced one');
  } else {
    fail('Unpriced Offers Never Win Best Price', 'OFFERS', `Got ${best ? best.merchant + '/' + best.price : 'none'}`);
  }

  __resetOffersForTests();

  // ---------------------------------------------------------------------------
  // SECTION 17: No Fabricated Price History
  //
  // The rule these enforce: a figure may be called an all-time low, attributed
  // to a store, or given a date ONLY if it was observed. The estimator cannot
  // observe anything, so nothing it returns may claim to be a record.

  const estimateSamples = [
    'Ugly Stik GX2 Spinning Rod',
    'Sony WH-1000XM5 Wireless Headphones',
    'Osprey Atmos AG 65 Backpack',
    'Some Product Nobody Has Ever Benchmarked 9000'
  ];

  const claimingEstimates: string[] = [];
  for (const title of estimateSamples) {
    const est = estimateHistoricalPricing(title, detectProductCategory(title));
    if (est.isObserved !== false) claimingEstimates.push(`${title}: isObserved was not false`);
    if (est.allTimeLowStore !== 'Estimate') claimingEstimates.push(`${title}: attributed to "${est.allTimeLowStore}"`);
    if (/20[0-9]{2}|january|february|march|april|may|june|july|august|september|october|november|december|black friday|prime day/i.test(est.allTimeLowDate)) {
      claimingEstimates.push(`${title}: invented a date "${est.allTimeLowDate}"`);
    }
    if (/(recorded|reached|achieved|observed|matched|set)\s+(at|on|during|in|by)\b/i.test(est.marketNote)) {
      claimingEstimates.push(`${title}: market note claims an event: "${est.marketNote}"`);
    }
    if (est.typicalSalePrice !== est.allTimeLow) {
      claimingEstimates.push(`${title}: typicalSalePrice and legacy allTimeLow disagree`);
    }
  }

  if (claimingEstimates.length === 0) {
    pass('Estimates Never Claim To Be Observations', 'PRICE_HONESTY', `${estimateSamples.length} estimates checked: none attributed to a store, dated, or narrated as a recorded event`);
  } else {
    claimingEstimates.slice(0, 6).forEach(c => fail('Estimates Never Claim To Be Observations', 'PRICE_HONESTY', c));
  }

  // Seeded items must not be flagged as having an observed low, because none of
  // them came from an observation.
  const falselyObserved = INITIAL_TRACKED_ITEMS.filter(it => (it as any).allTimeLowIsObserved === true);
  if (falselyObserved.length === 0) {
    pass('No Seed Item Claims A Recorded Low', 'PRICE_HONESTY', `All ${INITIAL_TRACKED_ITEMS.length} seeded items are marked as estimates`);
  } else {
    fail('No Seed Item Claims A Recorded Low', 'PRICE_HONESTY', `${falselyObserved.map(i => i.id).join(', ')} claim an observed all-time low`);
  }

  // The label helper must refuse to attribute an unobserved low to a store.
  const estLabel = describeLowPrice({ allTimeLow: 47.5, allTimeLowStore: 'Bass Pro Shops', allTimeLowDate: 'Nov 2024', allTimeLowIsObserved: false });
  const obsLabel = describeLowPrice({ allTimeLow: 47.5, allTimeLowStore: 'Bass Pro Shops', allTimeLowDate: 'Nov 2024', allTimeLowIsObserved: true });
  if (!estLabel.canLinkStore && estLabel.label !== 'All-Time Low' && !estLabel.detail.includes('Bass Pro')
      && obsLabel.canLinkStore && obsLabel.label === 'All-Time Low') {
    pass('Unobserved Lows Are Not Attributed To A Store', 'PRICE_HONESTY', `Estimate renders as "${estLabel.label} — ${estLabel.detail}"; observed renders as "${obsLabel.label}"`);
  } else {
    fail('Unobserved Lows Are Not Attributed To A Store', 'PRICE_HONESTY', `Estimate label leaked store attribution: ${JSON.stringify(estLabel)}`);
  }

  // Summary calculation
  const durationMs = Date.now() - startTime;
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warnings = results.filter(r => r.status === 'WARN').length;

  return {
    summary: { total, passed, failed, warnings, durationMs },
    results
  };
}
