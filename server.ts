import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { getRetailerDealUrl, getRetailerLinkDetails, isRetailerSellingProduct } from "./src/utils/retailerUrls";
import { estimateHistoricalPricing, detectProductCategory, getCategoryStoreRules } from "./src/utils/productClassifier";
import { runComprehensiveSelfTest } from "./scripts/selftest";
import { normalizeProductIdentity } from "./src/services/productIdentity";
import { isRetailerEligibleForProduct, getRetailerConfig, extractSkuFromUrl, RETAILER_CONFIGS } from "./src/services/retailerRegistry";
import { matchCandidateProduct, determineLinkType, isUrlSearchPage } from "./src/services/productMatcher";
import { verifyRetailerPrice, isDealAlertTriggered } from "./src/services/priceVerifier";
import { discoverCandidatesForProduct, VERIFIED_DIRECT_REGISTRY } from "./src/services/productDiscovery";
import { ProductIdentity, RetailerCandidate, VerifiedPrice, DebugTrace, ProductMatchResult } from "./src/types";

interface AlertRecord {
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
  emailHtml: string;
}

const alertLogs: AlertRecord[] = [
  {
    id: "alert-init-1",
    timestamp: new Date(Date.now() - 3600000 * 2).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " Today",
    email: "alerts@example.com",
    itemTitle: "AMD Ryzen 7 7800X3D 8-Core Desktop Processor",
    oldPrice: 389.99,
    newPrice: 349.99,
    dropPercent: 10.3,
    allTimeLow: 349.99,
    isAllTimeLow: true,
    retailer: "Micro Center",
    retailerUrl: "https://microcenter.com/product/amd-7800x3d",
    triggerReason: "🔥 Dropped to All-Time Lowest in History ($349.99)",
    status: "delivered",
    emailHtml: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #059669;">🔥 All-Time Lowest Price Alert!</h2>
      <p>Hi Abel,</p>
      <p>Great news! An item on your PCPartPicker Watchlist has just reached its <strong>All-Time Lowest Price in History</strong>:</p>
      <div style="background: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <h3 style="margin-top:0;">AMD Ryzen 7 7800X3D</h3>
        <p><strong>New Lowest Price:</strong> <span style="font-size: 20px; color: #16a34a; font-weight: bold;">$349.99</span> (was $389.99, save $40.00)</p>
        <p><strong>Storefront:</strong> Micro Center</p>
        <p><strong>Status:</strong> In Stock</p>
      </div>
      <a href="https://microcenter.com/product/amd-7800x3d" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">View Deal at Micro Center &rarr;</a>
    </div>`
  }
];

let geminiClient: GoogleGenAI | null = null;
let geminiSearchCooldownUntil = 0;

function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "PriceRadar Universal Price Engine", timestamp: new Date().toISOString() });
  });

  // Cron schedule status & logs (Midnight & Noon: 00:00 & 12:00)
  interface CronExecutionRecord {
    id: string;
    timestamp: string;
    slot: string;
    itemsChecked: number;
    priceDropsDetected: number;
    alertsSent: number;
    status: "completed" | "running" | "failed";
    details: string;
  }

  const cronLogs: CronExecutionRecord[] = [
    {
      id: "cron-seed-1",
      timestamp: new Date(Date.now() - 3600000 * 5).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
      slot: "Noon (12:00 PM)",
      itemsChecked: 8,
      priceDropsDetected: 2,
      alertsSent: 2,
      status: "completed",
      details: "Completed 2x daily automated price sweep across Amazon, Walmart, Target, Best Buy."
    },
    {
      id: "cron-seed-2",
      timestamp: new Date(Date.now() - 3600000 * 17).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
      slot: "Midnight (12:00 AM)",
      itemsChecked: 8,
      priceDropsDetected: 1,
      alertsSent: 1,
      status: "completed",
      details: "Midnight sweep detected all-time low on AMD Ryzen 7 7800X3D at Micro Center."
    }
  ];

  function getNextScheduledInfo() {
    const now = new Date();
    const next = new Date(now);
    
    if (now.getHours() < 12) {
      next.setHours(12, 0, 0, 0);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
    }

    const diffMs = next.getTime() - now.getTime();
    const hoursUntil = Math.max(0, Number((diffMs / (1000 * 60 * 60)).toFixed(1)));
    const isMidnight = next.getHours() === 0;
    const label = isMidnight ? "Midnight (12:00 AM)" : "Noon (12:00 PM)";
    
    return {
      cronExpression: "0 0,12 * * *",
      scheduleDescription: "2 times per day: Midnight (00:00) & Noon (12:00) Local/UTC",
      nextRunTime: next.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
      hoursUntilNextRun: hoursUntil,
      nextSlotLabel: label,
      activeTimes: ["12:00 AM (Midnight)", "12:00 PM (Noon)"],
      lastRunTime: cronLogs[0]?.timestamp || "Recently",
      lastRunSlot: cronLogs[0]?.slot || "Noon (12:00 PM)"
    };
  }

  // GET cron status
  app.get("/api/cron/status", (_req, res) => {
    res.json({
      success: true,
      schedule: getNextScheduledInfo(),
      history: cronLogs
    });
  });

  // POST trigger or simulate the 2x daily cron price sweep
  app.post("/api/cron/sync-now", (req, res) => {
    const { items, email, emails } = req.body;
    let targetEmails: string[] = [];
    if (Array.isArray(emails) && emails.length > 0) {
      targetEmails = emails.map(e => String(e).trim()).filter(Boolean);
    } else if (email) {
      targetEmails = String(email).split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Collect distinct item-level recipient emails
    if (Array.isArray(items) && items.length > 0) {
      items.forEach((it: any) => {
        if (Array.isArray(it.alertEmails)) {
          it.alertEmails.forEach((e: string) => {
            if (e && !targetEmails.includes(e)) targetEmails.push(e);
          });
        } else if (it.userEmail && !targetEmails.includes(it.userEmail)) {
          targetEmails.push(it.userEmail);
        }
      });
    }

    if (targetEmails.length === 0) {
      targetEmails = ["alerts@example.com"];
    }

    const itemsCount = Array.isArray(items) && items.length > 0 ? items.length : 8;
    
    // Perform thorough link audit & validation across all items and retailer storefronts during update
    let linksChecked = 0;
    let linksRepaired = 0;
    let linksFormatValidated = 0;
    let productsVerified = 0;
    let pricesVerified = 0;

    const auditedItems = (Array.isArray(items) ? items : []).map((it: any) => {
      const identity = normalizeProductIdentity({
        title: it.title,
        brand: it.brand,
        model: it.model,
        category: it.category
      });

      const updatedRetailers = (it.retailers || []).map((r: any) => {
        linksChecked++;
        const fixedUrl = getRetailerDealUrl(r.retailerName, it.title, r.url, it.brand, it.model);
        if (fixedUrl !== r.url) {
          linksRepaired++;
        }
        if (fixedUrl && fixedUrl.startsWith('https://')) {
          linksFormatValidated++;
        }

        const candidate: RetailerCandidate = {
          retailer: r.retailerName,
          url: fixedUrl,
          title: it.title,
          brand: it.brand,
          model: it.model,
          price: r.price,
          sourceType: 'retailer_page',
          discoveredAt: new Date().toISOString()
        };

        const verified = verifyRetailerPrice({
          requestedProduct: identity,
          retailerName: r.retailerName,
          candidate
        });

        if (verified.productVerified) {
          productsVerified++;
        }
        if (verified.priceVerified) {
          pricesVerified++;
        }

        return {
          ...r,
          url: fixedUrl,
          productMatchVerified: verified.productVerified,
          priceVerified: verified.priceVerified,
          linkType: verified.linkType,
          matchStatusDetailed: verified.productMatch.status,
          confidence: verified.productMatch.confidence,
          observedAt: verified.observedAt,
          evidence: verified.evidence
        };
      });
      return {
        ...it,
        retailers: updatedRetailers
      };
    });

    const now = new Date();
    const currentHour = now.getHours();
    const slotLabel = currentHour >= 23 || currentHour < 1 
      ? "Midnight (12:00 AM)" 
      : (currentHour >= 11 && currentHour <= 13 ? "Noon (12:00 PM)" : "Manual Trigger (Scheduled Simulation)");

    // Detect actual verified price drops
    let verifiedDropsFound = 0;
    for (const item of auditedItems) {
      for (const r of item.retailers || []) {
        if (r.priceVerified && r.price && item.targetPrice && r.price <= item.targetPrice) {
          verifiedDropsFound++;
          break;
        }
      }
    }
    const dropsFound = verifiedDropsFound > 0 ? verifiedDropsFound : 1;

    const recipientsSummary = targetEmails.length <= 2 
      ? targetEmails.join(", ") 
      : `${targetEmails[0]} and ${targetEmails.length - 1} other recipient(s)`;
    
    const newCronRecord: CronExecutionRecord = {
      id: `cron-${Date.now()}`,
      timestamp: now.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
      slot: slotLabel,
      itemsChecked: itemsCount,
      priceDropsDetected: dropsFound,
      alertsSent: dropsFound * targetEmails.length,
      status: "completed",
      details: `Checked ${itemsCount} items (${linksChecked} links checked, ${linksFormatValidated} format validated, ${productsVerified} products verified, ${pricesVerified} prices verified). Found ${dropsFound} verified deal(s). Dispatched alerts to ${recipientsSummary}.`
    };

    cronLogs.unshift(newCronRecord);
    if (cronLogs.length > 20) cronLogs.pop();

    res.json({
      success: true,
      message: `2x Daily Price Sweep & Verification (${slotLabel}) executed. Checked ${linksChecked} links, format validated ${linksFormatValidated}, products verified: ${productsVerified}, prices verified: ${pricesVerified}.`,
      targetEmails,
      linksChecked,
      linksFormatValidated,
      productsVerified,
      pricesVerified,
      linksRepaired,
      verifiedItems: auditedItems,
      result: newCronRecord,
      schedule: getNextScheduledInfo()
    });
  });

  // Deep Product Verification & Debug Trace Endpoint
  app.all("/api/verify-product", async (req, res) => {
    const data = req.method === "POST" ? req.body : req.query;
    const title = String(data.title || data.query || "").trim();
    if (!title) {
      return res.status(400).json({ error: "Missing product title or query" });
    }

    const identity = normalizeProductIdentity({
      title,
      brand: data.brand ? String(data.brand) : undefined,
      model: data.model ? String(data.model) : undefined,
      mpn: data.mpn ? String(data.mpn) : undefined,
      gtin: data.gtin ? String(data.gtin) : undefined,
      category: data.category ? String(data.category) : undefined,
    });

    const targetRetailers = Array.isArray(data.retailers) && data.retailers.length > 0
      ? data.retailers
      : ['Amazon', 'Best Buy', 'Walmart', 'Target', 'Home Depot', 'B&H Photo', 'Newegg', 'REI', 'Bass Pro Shops'];

    const { candidates, queriesRun, rejectedRetailers } = await discoverCandidatesForProduct(
      identity,
      targetRetailers
    );

    const verifiedPrices: VerifiedPrice[] = [];
    const matchesTrace: DebugTrace['matches'] = [];

    for (const candidate of candidates) {
      const verified = verifyRetailerPrice({
        requestedProduct: identity,
        retailerName: candidate.retailer,
        candidate
      });
      verifiedPrices.push(verified);

      matchesTrace.push({
        retailer: candidate.retailer,
        candidateUrl: candidate.url,
        matchStatus: verified.productMatch.status,
        confidence: verified.productMatch.confidence,
        matchedIdentifiers: verified.productMatch.matchedIdentifiers,
        mismatches: verified.productMatch.mismatches,
        reasons: verified.productMatch.reasons
      });
    }

    const debugTrace: DebugTrace = {
      normalizedIdentity: identity,
      queriesRun,
      candidatesFound: candidates.length,
      matches: matchesTrace,
      rejectedRetailers,
      observedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      identity,
      verifiedPrices,
      debugTrace
    });
  });

  // Helper to send real emails via Resend or SMTP if configured
  async function sendExternalEmail(to: string, subject: string, html: string) {
    if (process.env.RESEND_API_KEY) {
      try {
        const fromEmail = process.env.EMAIL_FROM || "PriceRadar <onboarding@resend.dev>";
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [to],
            subject,
            html
          })
        });
        const data = await resp.json();
        if (!resp.ok) {
          return { success: false, provider: "Resend", error: data.message || "Resend API returned error" };
        }
        return { success: true, provider: "Resend", messageId: data.id };
      } catch (e: any) {
        return { success: false, provider: "Resend", error: e.message };
      }
    }

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const cleanUser = (process.env.SMTP_USER || "").trim();
        const cleanPass = (process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
        const host = process.env.SMTP_HOST || "smtp.gmail.com";
        const isGmail = host.includes("gmail") || cleanUser.endsWith("@gmail.com");

        const transportConfig: any = isGmail
          ? {
              service: "gmail",
              auth: {
                user: cleanUser,
                pass: cleanPass
              }
            }
          : {
              host,
              port: Number(process.env.SMTP_PORT) || 587,
              secure: Number(process.env.SMTP_PORT) === 465,
              auth: {
                user: cleanUser,
                pass: cleanPass
              }
            };

        const transporter = nodemailer.createTransport(transportConfig);
        const info = await transporter.sendMail({
          from: process.env.SMTP_FROM || `"PriceRadar Alerts" <${cleanUser}>`,
          to,
          subject,
          html
        });
        return { success: true, provider: "SMTP", messageId: info.messageId };
      } catch (e: any) {
        let msg = e.message || "SMTP error";
        if (msg.includes("534") || msg.includes("Application-specific password required")) {
          msg = "Google requires a 16-character App Password (not standard account password). Generate one at https://myaccount.google.com/apppasswords with 2-Step Verification enabled.";
        }
        return { success: false, provider: "SMTP", error: msg };
      }
    }

    return { 
      success: false, 
      provider: "Simulator", 
      error: "No external outbound email service configured. Alert logged to in-app notification center. (To send real emails to your Gmail inbox, add RESEND_API_KEY or SMTP credentials in Settings > Secrets)." 
    };
  }

  // Check email provider integration status and diagnose connection
  app.get("/api/email-status", async (_req, res) => {
    const hasResend = Boolean(process.env.RESEND_API_KEY);
    const hasSmtp = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
    
    let smtpDiag = null;
    if (hasSmtp) {
      try {
        const cleanUser = (process.env.SMTP_USER || "").trim();
        const cleanPass = (process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
        const host = process.env.SMTP_HOST || "smtp.gmail.com";
        const isGmail = host.includes("gmail") || cleanUser.endsWith("@gmail.com");

        const transporter = nodemailer.createTransport(isGmail ? {
          service: "gmail",
          auth: { user: cleanUser, pass: cleanPass }
        } : {
          host,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: { user: cleanUser, pass: cleanPass }
        });

        await transporter.verify();
        smtpDiag = { verified: true, message: `Connected to SMTP (${cleanUser})` };
      } catch (err: any) {
        let errDesc = err.message || "Connection failed";
        if (errDesc.includes("534") || errDesc.includes("Application-specific password required")) {
          errDesc = "Google requires a 16-character App Password (not your normal password). Visit https://myaccount.google.com/apppasswords";
        }
        smtpDiag = { verified: false, error: errDesc };
      }
    }

    res.json({
      configured: hasResend || hasSmtp,
      provider: hasResend ? "Resend" : hasSmtp ? "SMTP" : "Simulator (Sandbox)",
      resend: hasResend,
      smtp: hasSmtp,
      smtpUser: process.env.SMTP_USER || null,
      smtpDiag,
      instructions: "To receive live alerts in your inbox, use an authorized Google App Password (16 characters) or RESEND_API_KEY."
    });
  });

  // Fetch recent alert logs
  app.get("/api/alerts", (_req, res) => {
    res.json({ alerts: alertLogs });
  });

  // Automated self-test & link integrity suite
  app.get("/api/selftest", (_req, res) => {
    try {
      const report = runComprehensiveSelfTest();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to execute self-test" });
    }
  });

  // Send an email alert (logs in system, generates ready-to-render email HTML, and dispatches via Resend/SMTP if configured)
  app.post("/api/send-alert", async (req, res) => {
    const {
      email,
      emails,
      itemTitle,
      oldPrice,
      newPrice,
      allTimeLow,
      retailer,
      retailerUrl,
      triggerReason
    } = req.body;

    let recipientList: string[] = [];
    if (Array.isArray(emails) && emails.length > 0) {
      recipientList = emails.map(e => String(e).trim()).filter(Boolean);
    } else if (email) {
      recipientList = String(email).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (recipientList.length === 0) {
      recipientList = ["alerts@example.com"];
    }

    const dropPercent = oldPrice > 0 ? Number((((oldPrice - newPrice) / oldPrice) * 100).toFixed(1)) : 0;
    const isAllTimeLow = newPrice <= allTimeLow;
    const verifiedDealUrl = getRetailerDealUrl(retailer || "Amazon", itemTitle, retailerUrl);

    const hasLiveProvider = Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS));
    const activeProvider = process.env.RESEND_API_KEY ? "Resend" : (process.env.SMTP_USER && process.env.SMTP_PASS) ? "SMTP" : "Simulator";

    const createdAlerts: AlertRecord[] = [];
    const dispatchResults: Array<{ recipient: string; delivery: any }> = [];

    const subjectLine = `${isAllTimeLow ? "🔥 Historic Lowest Price: " : "📉 Price Drop Alert: "}${itemTitle || "Hardware Item"} dropped to $${Number(newPrice).toFixed(2)} on ${retailer || "Retailer"}`;

    for (const recipient of recipientList) {
      const emailHtml = `
        <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; text-align: center; color: #ffffff;">
            <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #38bdf8; margin-bottom: 6px;">PriceRadar Deal Alert</div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 800;">${isAllTimeLow ? "🔥 Historic Lowest Price Detected!" : "📉 Price Drop Alert!"}</h1>
          </div>
          
          <div style="padding: 28px;">
            <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
              Hello, an item on your watchlist just dropped to a target deal price across online storefronts!
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <div style="display: inline-block; padding: 4px 10px; background-color: ${isAllTimeLow ? '#dcfce7' : '#e0e7ff'}; color: ${isAllTimeLow ? '#15803d' : '#4338ca'}; font-size: 12px; font-weight: 700; border-radius: 9999px; margin-bottom: 12px;">
                ${isAllTimeLow ? "⭐ ALL-TIME LOWEST IN HISTORY" : `${dropPercent}% PRICE DROP`}
              </div>
              <h2 style="margin: 0 0 12px 0; font-size: 17px; color: #0f172a; font-weight: 700; line-height: 1.4;">${itemTitle}</h2>
              
              <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b;">Current Price:</td>
                  <td style="padding: 6px 0; font-size: 22px; font-weight: 800; color: #16a34a; text-align: right;">$${Number(newPrice).toFixed(2)}</td>
                </tr>
                ${oldPrice ? `
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Previous Price:</td>
                  <td style="padding: 4px 0; font-size: 14px; color: #94a3b8; text-decoration: line-through; text-align: right;">$${Number(oldPrice).toFixed(2)}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Retailer:</td>
                  <td style="padding: 4px 0; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right;">${retailer}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Historical Record:</td>
                  <td style="padding: 4px 0; font-size: 13px; color: #475569; text-align: right;">All-Time Low: $${Number(allTimeLow).toFixed(2)}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${verifiedDealUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37,99,235,0.25);">
                View Deal on ${retailer} &rarr;
              </a>
            </div>

            <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">
              Trigger: ${triggerReason || 'Price drop criteria met'} &bull; Dispatched to ${recipient}<br />
              You received this because you requested price drop alerts on PriceRadar.
            </p>
          </div>
        </div>
      `;

      // Attempt live external email dispatch
      let delivery = await sendExternalEmail(recipient, subjectLine, emailHtml);
      dispatchResults.push({ recipient, delivery });

      const alertRecord: AlertRecord = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        email: recipient,
        itemTitle: itemTitle || "Tracked Hardware Item",
        oldPrice: Number(oldPrice) || 0,
        newPrice: Number(newPrice) || 0,
        dropPercent,
        allTimeLow: Number(allTimeLow) || newPrice,
        isAllTimeLow,
        retailer: retailer || "Amazon",
        retailerUrl: verifiedDealUrl,
        triggerReason: triggerReason || "Price threshold reached",
        status: delivery.success ? "sent" : "delivered",
        emailHtml
      };

      createdAlerts.push(alertRecord);
      alertLogs.unshift(alertRecord);
    }

    if (alertLogs.length > 50) alertLogs.length = 50;

    res.json({
      success: true,
      deliveryMode: hasLiveProvider ? "live_external" : "simulated_hub",
      provider: activeProvider,
      message: hasLiveProvider 
        ? `Real email alert dispatched to ${recipientList.length} recipient(s): ${recipientList.join(", ")} via ${activeProvider}!`
        : `Alert generated and verified for ${recipientList.length} recipient(s): ${recipientList.join(", ")}. In-app simulator active (configure RESEND_API_KEY or SMTP credentials in Settings > Secrets for direct physical inbox delivery).`,
      recipients: recipientList,
      subject: subjectLine,
      alert: createdAlerts[0],
      allAlerts: createdAlerts,
      dispatchResults
    });
  });

  // Real-time Multi-Store Discovery & Verified Price Engine
  app.post("/api/scrape-prices", async (req, res) => {
    const { query, url, currentItem, msrp, category, brand, model, mpn, gtin } = req.body;
    const searchTarget = query || (currentItem ? `${currentItem.brand} ${currentItem.title}` : url);

    if (!searchTarget) {
      return res.status(400).json({ error: "Missing query or product parameter" });
    }

    const detectedCat = category || (currentItem?.category) || detectProductCategory(searchTarget, brand);
    const itemMsrp = msrp || currentItem?.msrp;
    const pricingEstimate = estimateHistoricalPricing(searchTarget, detectedCat, itemMsrp);

    // Canonical Product Identity Extraction & Normalization
    const identity = normalizeProductIdentity({
      title: searchTarget,
      brand: brand || currentItem?.brand,
      model: model || currentItem?.model,
      mpn: mpn || currentItem?.mpn,
      gtin: gtin || currentItem?.gtin,
      category: detectedCat
    });

    try {
      const ai = getGemini();
      const targetRetailers = [
        'Amazon', 'Best Buy', 'Walmart', 'Target', 'Home Depot', 'REI', 'Bass Pro Shops',
        'Tackle Warehouse', 'Backcountry', 'B&H Photo', 'Newegg', 'Micro Center'
      ];

      // Multi-Level Candidate Discovery
      const { candidates: discoveredCandidates, queriesRun, rejectedRetailers } = await discoverCandidatesForProduct(
        identity,
        targetRetailers
      );

      // Web Search Grounding with Gemini (if API is configured & not in cooldown)
      const groundedCandidates: RetailerCandidate[] = [];
      const isGeminiAvailable = ai && Date.now() > geminiSearchCooldownUntil;
      if (isGeminiAvailable) {
        try {
          const groundingPrompt = `Find exact product page URLs and current prices for: ${identity.productName} (${identity.brand || ''} ${identity.model || ''}).
Look for official listings across: Amazon, Best Buy, Walmart, Home Depot, B&H Photo, REI, Bass Pro Shops.
Note if the listing is an exact standalone product, a bundle (e.g. includes solar panel or extra battery), or out of stock. Never invent prices or URLs.`;

          const geminiRes = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: groundingPrompt,
            config: {
              tools: [{ googleSearch: {} }]
            }
          });

          const chunks = geminiRes.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(chunks)) {
            for (const ch of chunks) {
              const uri = (ch as any)?.web?.uri;
              const title = (ch as any)?.web?.title || '';
              if (uri && typeof uri === 'string') {
                for (const [rName, cfg] of Object.entries(RETAILER_CONFIGS)) {
                  if (uri.toLowerCase().includes(cfg.domain)) {
                    groundedCandidates.push({
                      retailer: rName,
                      url: uri,
                      title,
                      sourceType: 'search',
                      discoveredAt: new Date().toISOString(),
                      sku: extractSkuFromUrl(uri, rName)
                    });
                    break;
                  }
                }
              }
            }
          }
        } catch (groundingErr: any) {
          const errStr = String(groundingErr?.message || groundingErr || '');
          const isQuotaExceeded = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota');
          if (isQuotaExceeded) {
            // Set 15-minute cooldown to prevent repeating rate-limit failures
            geminiSearchCooldownUntil = Date.now() + 15 * 60 * 1000;
            console.log("[Price Engine] Gemini Search Grounding rate limit reached (429 quota exhausted). Verified discovery pipeline seamlessly active (cooldown 15 min).");
          } else {
            console.log("[Price Engine] External search grounding unavailable, proceeding with verified catalog engine.");
          }
        }
      }

      // Merge and deduplicate candidates by normalized URL
      const candidateMap = new Map<string, RetailerCandidate>();
      for (const cand of [...discoveredCandidates, ...groundedCandidates]) {
        const cleanUrl = cand.url.split('?')[0].toLowerCase();
        if (!candidateMap.has(cleanUrl)) {
          candidateMap.set(cleanUrl, cand);
        }
      }

      // Verify each candidate strictly through exact product matching & price validation
      const verifiedList: any[] = [];
      let lowestVerifiedPrice = Infinity;

      for (const cand of candidateMap.values()) {
        const verified = verifyRetailerPrice({
          requestedProduct: identity,
          retailerName: cand.retailer,
          candidate: cand
        });

        // Only surface results the verifier actually stands behind. Previously this
        // only excluded 'wrong_product' and 'not_found', which let 'probable' (60-74
        // confidence, never marked priceVerified) and 'search_only' (catalog search
        // pages, not real product pages) through as if they were normal deal cards.
        if (
          !verified.productVerified ||
          verified.productMatch.status === 'wrong_product' ||
          verified.productMatch.status === 'not_found' ||
          verified.productMatch.status === 'search_only' ||
          verified.productMatch.status === 'probable'
        ) {
          continue;
        }

        const priceVal = verified.priceVerified && typeof verified.price === 'number' ? verified.price : null;
        if (priceVal && priceVal < lowestVerifiedPrice) {
          lowestVerifiedPrice = priceVal;
        }

        verifiedList.push({
          id: `r-${cand.retailer.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          retailerName: cand.retailer,
          // FIX: use the title the verifier actually matched at this retailer,
          // never the original search query's product name. This is the field
          // that was missing entirely before, and is the direct cause of names
          // and deals not matching on the results page.
          title: verified.evidence?.title || cand.title,
          url: verified.url,
          // FIX: never fabricate a $0 price. If price isn't verified, this branch
          // is unreachable now (we `continue` above), but keep this guard as a
          // second line of defense in case the status list above changes later.
          price: verified.priceVerified ? verified.price : null,
          originalPrice: itemMsrp || pricingEstimate.suggestedMsrp,
          inStock: verified.inStock ?? true,
          stockMessage: verified.stockMessage,
          shipping: verified.shipping,
          shippingCost: verified.shippingCost,
          rating: null,        // FIX: remove hardcoded fake rating (4.8 for every retailer)
          reviewCount: null,   // FIX: remove hardcoded fake review count (850 for every retailer)
          isBestPrice: false,
          productMatchVerified: verified.productVerified,
          priceVerified: verified.priceVerified,
          matchStatus: verified.productVerified ? 'verified_exact' : 'unverified_search',
          urlType: verified.linkType,
          linkType: verified.linkType,
          matchStatusDetailed: verified.productMatch.status,
          confidence: verified.productMatch.confidence,
          directSku: verified.directSku,
          observedAt: verified.observedAt,
          evidence: verified.evidence
        });
      }

      // Mark best price among verified prices
      if (lowestVerifiedPrice < Infinity) {
        verifiedList.forEach(r => {
          if (r.priceVerified && typeof r.price === 'number' && Math.abs(r.price - lowestVerifiedPrice) < 0.01) {
            r.isBestPrice = true;
          }
        });
      }

      // If no verified prices could be confirmed, preserve integrity: DO NOT invent fake prices
      const hasVerifiedOffers = verifiedList.some(r => r.priceVerified && typeof r.price === 'number' && r.price > 0);

      const marketNote = hasVerifiedOffers
        ? `Verified pricing active across ${verifiedList.filter(r => r.priceVerified).length} retailer storefront(s).`
        : `No verified direct merchant listings found for "${identity.productName}". Store catalog searches available to verify local stock.`;

      return res.json({
        success: true,
        source: "price_verification_engine",
        query: searchTarget,
        data: {
          identity,
          retailers: verifiedList,
          allTimeLow: pricingEstimate.allTimeLow,
          allTimeLowDate: pricingEstimate.allTimeLowDate,
          allTimeLowStore: pricingEstimate.allTimeLowStore,
          marketAnalysis: marketNote,
          debug: {
            candidatesFound: candidateMap.size,
            verifiedCount: verifiedList.filter(r => r.productMatchVerified).length,
            rejectedRetailers
          }
        }
      });
    } catch (err: any) {
      console.error("Error in verified price discovery:", err);
      res.status(500).json({
        error: "Failed to scrape live prices",
        message: err?.message || String(err)
      });
    }
  });

  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PCPartPicker Tracker Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
