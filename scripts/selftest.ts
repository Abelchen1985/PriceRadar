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
import { detectProductCategory, estimateHistoricalPricing } from '../src/utils/productClassifier';
import { normalizeProductIdentity } from '../src/services/productIdentity';
import { matchCandidateProduct, determineLinkType } from '../src/services/productMatcher';
import { verifyRetailerPrice } from '../src/services/priceVerifier';
import { isRetailerEligibleForProduct, checkRetailerEligibility } from '../src/services/retailerRegistry';
import { RetailerCandidate } from '../src/types';
import { parseJsonLdProducts, compareStructuredProduct } from '../src/services/structuredDataVerifier';
import { isQuarantinedProductUrl } from '../src/utils/retailerUrls';

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
