/**
 * Centralized Retailer Configuration & Registry
 * 
 * Rules:
 * 1. Retailer configuration specifies search URLs, domains, and identifier extraction rules.
 * 2. Retailers must NEVER be assumed to sell every product.
 * 3. A retailer only appears as a CURRENT PRICE result if real evidence confirms it sells the product.
 */

import { ProductIdentity } from '../types';

export interface RetailerConfig {
  name: string;
  domain: string;
  searchUrl: (query: string) => string;
  supportsDirectProductDetection: boolean;
  productIdPatterns: RegExp[];
  priority: number;
  prohibitedCategories?: string[];
  allowedCategories?: string[];
}

export const RETAILER_CONFIGS: Record<string, RetailerConfig> = {
  'Amazon': {
    name: 'Amazon',
    domain: 'amazon.com',
    searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i
    ],
    priority: 1
  },
  'Best Buy': {
    name: 'Best Buy',
    domain: 'bestbuy.com',
    searchUrl: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/site\/[^/]+\/([0-9]{7})\.p/i,
      /skuId=([0-9]{7})/i
    ],
    prohibitedCategories: ['Fishing & Angling', 'Hunting & Optics', 'Kayaking & Water Sports'],
    priority: 2
  },
  'Walmart': {
    name: 'Walmart',
    domain: 'walmart.com',
    searchUrl: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/ip\/[^/]+\/([0-9]{6,12})/i,
      /\/ip\/([0-9]{6,12})/i
    ],
    priority: 3
  },
  'Target': {
    name: 'Target',
    domain: 'target.com',
    searchUrl: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/p\/[^/]+\/-\/A-([0-9]+)/i,
      /tcin=([0-9]+)/i
    ],
    prohibitedCategories: ['PC Components', 'Solar Generators', 'Heavy Power Stations'],
    priority: 4
  },
  'Home Depot': {
    name: 'Home Depot',
    domain: 'homedepot.com',
    searchUrl: (q) => `https://www.homedepot.com/s/${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/p\/[^/]+\/([0-9]{8,10})/i
    ],
    allowedCategories: ['Tools & Hardware', 'Camping & Bushcraft', 'Appliances', 'Home & Kitchen', 'Smart Home'],
    priority: 5
  },
  'B&H Photo': {
    name: 'B&H Photo',
    domain: 'bhphotovideo.com',
    searchUrl: (q) => `https://www.bhphotovideo.com/c/search?Ntt=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/c\/product\/([0-9]+-[A-Z]+)/i,
      /\/product\/([0-9]+-[A-Z]+)/i
    ],
    allowedCategories: ['Audio & Headphones', 'Cameras & Drones', 'Laptops & Computers', 'PC Components', 'Electronics'],
    priority: 6
  },
  'Newegg': {
    name: 'Newegg',
    domain: 'newegg.com',
    searchUrl: (q) => `https://www.newegg.com/p/pl?d=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/p\/([A-Z0-9]{15,20})/i,
      /\/p\/N[0-9]{8,12}/i
    ],
    allowedCategories: ['PC Components', 'Laptops & Computers', 'Gaming & Consoles', 'Electronics'],
    priority: 7
  },
  'Micro Center': {
    name: 'Micro Center',
    domain: 'microcenter.com',
    searchUrl: (q) => `https://www.microcenter.com/search/search_results.aspx?Ntt=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/product\/([0-9]{6})/i
    ],
    allowedCategories: ['PC Components', 'Laptops & Computers', 'Electronics', 'Gaming & Consoles'],
    priority: 8
  },
  'REI': {
    name: 'REI',
    domain: 'rei.com',
    searchUrl: (q) => `https://www.rei.com/search?q=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/product\/([0-9]{6,8})/i
    ],
    allowedCategories: ['Hiking & Backpacking', 'Camping & Bushcraft', 'Outdoor Apparel & Boots', 'Kayaking & Water Sports'],
    priority: 9
  },
  'Backcountry': {
    name: 'Backcountry',
    domain: 'backcountry.com',
    searchUrl: (q) => `https://www.backcountry.com/Store/catalog/search.jsp?q=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/b\/([a-z0-9-]+)/i
    ],
    allowedCategories: ['Hiking & Backpacking', 'Camping & Bushcraft', 'Outdoor Apparel & Boots'],
    priority: 10
  },
  'Bass Pro Shops': {
    name: 'Bass Pro Shops',
    domain: 'basspro.com',
    searchUrl: (q) => `https://www.basspro.com/shop/en/SearchDisplay?searchTerm=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/shop\/en\/([a-z0-9-]+)/i
    ],
    allowedCategories: ['Fishing & Angling', 'Hunting & Optics', 'Camping & Bushcraft', 'Kayaking & Water Sports', 'Outdoor Apparel & Boots'],
    priority: 11
  },
  'Tackle Warehouse': {
    name: 'Tackle Warehouse',
    domain: 'tacklewarehouse.com',
    searchUrl: (q) => `https://www.tacklewarehouse.com/searchresults.html?search=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\/descpage-([A-Z0-9]+)\.html/i
    ],
    allowedCategories: ['Fishing & Angling'],
    priority: 12
  },
  'Costco': {
    name: 'Costco',
    domain: 'costco.com',
    searchUrl: (q) => `https://www.costco.com/CatalogSearch?dept=All&keyword=${encodeURIComponent(q)}`,
    supportsDirectProductDetection: true,
    productIdPatterns: [
      /\.product\.([0-9]{8,12})\.html/i
    ],
    priority: 13
  }
};

/**
 * Normalizes retailer name to find matched configuration
 */
export function getRetailerConfig(retailerName: string): RetailerConfig | undefined {
  const norm = (retailerName || '').trim().toLowerCase();
  for (const [key, config] of Object.entries(RETAILER_CONFIGS)) {
    if (key.toLowerCase() === norm || norm.includes(config.domain.split('.')[0])) {
      return config;
    }
  }
  return undefined;
}

export interface RetailerEligibilityResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Checks whether a given retailer plausibly stocks and sells a product with granular reasoning.
 * Prevents non-selling merchants (like Target for solar generators or Micro Center for fishing rods)
 * from being given fabricated prices.
 */
export function checkRetailerEligibility(
  retailerName: string,
  categoryOrProduct?: string | ProductIdentity,
  title?: string,
  brand?: string,
  model?: string
): RetailerEligibilityResult {
  const isProductObj = typeof categoryOrProduct === 'object' && categoryOrProduct !== null;
  const category: string | undefined = isProductObj 
    ? (categoryOrProduct as ProductIdentity).category 
    : (categoryOrProduct as string | undefined);
  const t = (isProductObj 
    ? ((categoryOrProduct as ProductIdentity).productName || (categoryOrProduct as ProductIdentity).normalizedTitle || '') 
    : (title || '')).toLowerCase();
  const b = (isProductObj ? ((categoryOrProduct as ProductIdentity).brand || '') : (brand || '')).toLowerCase();
  const m = (isProductObj ? ((categoryOrProduct as ProductIdentity).model || '') : (model || '')).toLowerCase();
  const r = (retailerName || '').toLowerCase();

  // Target explicitly does NOT stock Anker SOLIX C1000 series, Jackery Explorer 1500, or heavy power stations
  if (r.includes('target')) {
    if (t.includes('solix') || t.includes('c1000') || (b.includes('anker') && t.includes('power station'))) {
      return { eligible: false, reason: 'Target does not stock Anker SOLIX power stations' };
    }
    if (t.includes('jackery') || t.includes('solar generator') || m.includes('1500 v2')) {
      return { eligible: false, reason: 'Target does not stock heavy solar generators' };
    }
    if (category === 'PC Components' || t.includes('7800x3d') || t.includes('ryzen') || t.includes('rtx')) {
      return { eligible: false, reason: 'Target does not stock standalone PC components or CPUs' };
    }
  }

  // Micro Center does NOT sell outdoor backpacking tents, fishing gear, or general apparel
  if (r.includes('micro center') || r.includes('microcenter')) {
    if (t.includes('backpack') || t.includes('spinning rod') || t.includes('ugly stik') || t.includes('tent')) {
      return { eligible: false, reason: 'Micro Center does not stock outdoor/fishing gear' };
    }
  }

  // Tackle Warehouse sells only Fishing & Angling gear
  if (r.includes('tackle warehouse')) {
    if (category && category !== 'Fishing & Angling' && !t.includes('rod') && !t.includes('reel') && !t.includes('stradic')) {
      return { eligible: false, reason: 'Tackle Warehouse stocks exclusively fishing equipment' };
    }
  }

  // REI sells outdoor gear, not internal PC components or OLED TVs
  if (r.includes('rei')) {
    if (category === 'PC Components' || t.includes('7800x3d') || t.includes('oled') || t.includes('tv')) {
      return { eligible: false, reason: 'REI does not stock internal PC components or OLED televisions' };
    }
  }

  // Check config-level allowed / prohibited categories
  const config = getRetailerConfig(retailerName);
  if (config && category) {
    if (config.prohibitedCategories && config.prohibitedCategories.includes(category)) {
      return { eligible: false, reason: `${retailerName} explicitly does not carry ${category}` };
    }
    if (config.allowedCategories && !config.allowedCategories.includes(category)) {
      return { eligible: false, reason: `${retailerName} catalog focuses on ${config.allowedCategories.join(', ')}` };
    }
  }

  return { eligible: true };
}

/**
 * Convenience boolean check for retailer eligibility
 */
export function isRetailerEligibleForProduct(
  retailerName: string,
  categoryOrProduct?: string | ProductIdentity,
  title?: string,
  brand?: string,
  model?: string
): boolean {
  return checkRetailerEligibility(retailerName, categoryOrProduct, title, brand, model).eligible;
}

/**
 * Extracts a candidate product SKU from an exact product URL
 */
export function extractSkuFromUrl(url: string, retailerName?: string): string | undefined {
  if (!url) return undefined;
  
  // Try all known patterns or matched retailer config
  const configs = retailerName ? [getRetailerConfig(retailerName)].filter(Boolean) as RetailerConfig[] : Object.values(RETAILER_CONFIGS);

  for (const cfg of configs) {
    for (const pattern of cfg.productIdPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return undefined;
}
