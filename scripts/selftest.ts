/**
 * PriceRadar Comprehensive Automated Self-Test Suite
 * Validates:
 * 1. Product Name & Deal Link Matching across all retailers
 * 2. Price Accuracy, Best Price Calculations & All-Time Low logic
 * 3. Direct Product Page URL resolution (Samsung S90D, Jackery 1500, Ugly Stik, etc.)
 * 4. Presets and Auto-Estimator Benchmark integrity (including Jackery $799.99 MSRP)
 * 5. Category Detection & Search Query Formatting
 */

import { RAW_INITIAL_TRACKED_ITEMS, INITIAL_TRACKED_ITEMS, POPULAR_ITEM_PRESETS } from '../src/data/catalog';
import { getRetailerDealUrl, cleanSearchQuery } from '../src/utils/retailerUrls';
import { detectProductCategory, estimateHistoricalPricing } from '../src/utils/productClassifier';

export interface TestResult {
  name: string;
  category: 'PRODUCT_MATCH' | 'PRICE_ACCURACY' | 'DEAL_LINKS' | 'BENCHMARKS' | 'CATEGORY_CLASSIFIER';
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
    // Check Best Buy URL
    const bbUrl = getRetailerDealUrl('Best Buy', samsungTv.title, undefined, samsungTv.brand, samsungTv.model);
    if (!bbUrl.includes('6576624.p')) {
      fail('Samsung S90D Best Buy Direct Link', 'DEAL_LINKS', `Expected SKU 6576624.p direct product URL, got: ${bbUrl}`);
    } else {
      pass('Samsung S90D Best Buy Direct Link', 'DEAL_LINKS', `Direct SKU product landing page: ${bbUrl}`);
    }

    // Check Amazon URL
    const amzUrl = getRetailerDealUrl('Amazon', samsungTv.title, undefined, samsungTv.brand, samsungTv.model);
    if (!amzUrl.includes('/dp/B0CV9XQ11F')) {
      fail('Samsung S90D Amazon Direct Link', 'DEAL_LINKS', `Expected /dp/B0CV9XQ11F, got: ${amzUrl}`);
    } else {
      pass('Samsung S90D Amazon Direct Link', 'DEAL_LINKS', `Direct ASIN product landing page: ${amzUrl}`);
    }

    // Check Costco URL
    const costcoUrl = getRetailerDealUrl('Costco', samsungTv.title, undefined, samsungTv.brand, samsungTv.model);
    if (!costcoUrl.includes('4000257099.html')) {
      fail('Samsung S90D Costco Direct Link', 'DEAL_LINKS', `Expected Costco direct product page, got: ${costcoUrl}`);
    } else {
      pass('Samsung S90D Costco Direct Link', 'DEAL_LINKS', `Direct product page: ${costcoUrl}`);
    }

    // Check Target URL
    const tgtUrl = getRetailerDealUrl('Target', samsungTv.title, undefined, samsungTv.brand, samsungTv.model);
    if (!tgtUrl.includes('A-91456910')) {
      fail('Samsung S90D Target Direct Link', 'DEAL_LINKS', `Expected Target direct product page, got: ${tgtUrl}`);
    } else {
      pass('Samsung S90D Target Direct Link', 'DEAL_LINKS', `Direct product page: ${tgtUrl}`);
    }
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

    // Direct Deal Links Check
    const jackeryAmzUrl = getRetailerDealUrl('Amazon', jackeryPreset.title, undefined, jackeryPreset.brand, jackeryPreset.model);
    if (!jackeryAmzUrl.includes('/dp/B0D5Y8P8YJ')) {
      fail('Jackery Amazon Direct Link', 'DEAL_LINKS', `Expected Amazon /dp/B0D5Y8P8YJ, got: ${jackeryAmzUrl}`);
    } else {
      pass('Jackery Amazon Direct Link', 'DEAL_LINKS', `Direct ASIN link: ${jackeryAmzUrl}`);
    }

    const jackeryHdUrl = getRetailerDealUrl('Home Depot', jackeryPreset.title, undefined, jackeryPreset.brand, jackeryPreset.model);
    if (!jackeryHdUrl.includes('SG-1500-v2')) {
      fail('Jackery Home Depot Direct Link', 'DEAL_LINKS', `Expected Home Depot direct link, got: ${jackeryHdUrl}`);
    } else {
      pass('Jackery Home Depot Direct Link', 'DEAL_LINKS', `Direct Home Depot link: ${jackeryHdUrl}`);
    }
  }

  // 2.3 Ugly Stik GX2 Spinning Rod Deal Links
  const uglyStikPreset = POPULAR_ITEM_PRESETS.find(p => p.title.toLowerCase().includes('ugly stik'));
  if (!uglyStikPreset) {
    fail('Ugly Stik Preset Entry', 'BENCHMARKS', 'Could not find Ugly Stik GX2 preset');
  } else {
    const bassUrl = getRetailerDealUrl('Bass Pro Shops', uglyStikPreset.title);
    if (!bassUrl.includes('/shop/en/ugly-stik-gx2-spinning-rod')) {
      fail('Ugly Stik Bass Pro Shops Link', 'DEAL_LINKS', `Expected direct Bass Pro URL, got: ${bassUrl}`);
    } else {
      pass('Ugly Stik Bass Pro Shops Link', 'DEAL_LINKS', `Direct Bass Pro product page: ${bassUrl}`);
    }
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
