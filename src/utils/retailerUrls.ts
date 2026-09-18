/**
 * Official Storefront Search & Deal URL Generator
 * 
 * Strict Reliability Principles:
 * 1. Never guess product slugs that result in 404 "Page Not Found".
 * 2. Maintain a verified direct product URL registry with authentic retailer ASINs, SKUs, and IDs.
 * 3. Preserve existing verified direct URLs and never overwrite them with search URLs.
 * 4. When a direct product page is unavailable or unverified, route cleanly to the
 *    retailer's official precision catalog search endpoint.
 * 5. Transparently differentiate between "Direct Product" and "Catalog Search" in the UI.
 */

import { ProductMatchStatus, RetailerUrlType } from '../types';

export type { RetailerUrlType };

export interface RetailerLinkDetails {
  url: string;
  type: RetailerUrlType;
  isDirect: boolean;
  productMatchVerified: boolean;
  matchStatus: ProductMatchStatus;
  badgeLabel: string;
  tooltip: string;
  actionText: string;
  directSku?: string;
}

export function cleanSearchQuery(title: string, brand?: string, model?: string): string {
  let query = title || '';

  // Clean out parenthetical specs, quotes, and fluff words that break retailer search engines
  query = query
    .replace(/\s*\([^)]*\)/g, '') // remove parenthetical specs like (16GB RAM, 512GB SSD), (L/XL), etc.
    .replace(/(\d+)\s*["”]/g, '$1-Inch')
    .replace(/\bClass\b/gi, '')
    .replace(/\bSmart TV\b/gi, 'TV')
    .replace(/\bMen's Expedition\b/gi, '')
    .replace(/\bFreshwater & Saltwater\b/gi, '')
    .replace(/\b8-Core Gaming Desktop Processor\b/gi, '')
    .replace(/\bLightweight Satellite Communicator GPS\b/gi, 'Satellite Communicator')
    .replace(/\bHard Rugged Outdoor & Marine\b/gi, '')
    .replace(/\bCordless Vacuum Cleaner\b/gi, 'Cordless Vacuum')
    .replace(/\bEspresso Machine & Grinder\b/gi, 'Espresso Machine')
    .replace(/[#,/\\+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If brand is provided and not already in the query, prepend it
  if (brand && !query.toLowerCase().includes(brand.toLowerCase())) {
    query = `${brand} ${query}`.trim();
  }

  // Append the model number when it is a shopper-facing identifier that retailer
  // search engines actually index (mixed letters + digits, e.g. WH1000XM5,
  // QN65S90DAFXZA, DCK280C2). This is what makes a search link land on the exact
  // product instead of a category page. Long internal MPNs and part numbers with
  // slashes/spaces (e.g. 010-02679-00, MXD13LL/A) are skipped: retailers rarely
  // index them and they only dilute the query.
  if (model) {
    const compactModel = model.trim();
    const isSearchableModel =
      /^[A-Za-z0-9-]{4,14}$/.test(compactModel) &&
      /[A-Za-z]/.test(compactModel) &&
      /[0-9]/.test(compactModel);
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (isSearchableModel && !normalize(query).includes(normalize(compactModel))) {
      query = `${query} ${compactModel}`.trim();
    }
  }

  return query;
}

/**
 * Verified direct product page registry.
 *
 * INTEGRITY RULE: a URL may only appear here after it has been loaded and
 * confirmed to show the exact product it claims to represent. Every entry below
 * carries the product title that the live retailer page actually returned when
 * it was checked.
 *
 * Anything not on this list deliberately resolves to the retailer's official
 * catalog search for the exact brand + model (see buildStorefrontSearchUrl).
 * A search link always lands the shopper on the right product and degrades
 * gracefully; a fabricated SKU does not -- it silently sends them to an
 * unrelated item or a dead page, which is far worse than one extra click.
 *
 * Do NOT add an entry here from memory, from a pattern, or by guessing an ID
 * off a product name. Load the page first.
 */
interface VerifiedDirectLink {
  /** Matches the requested product against title + model (both lowercased) */
  matches: (title: string, model: string) => boolean;
  /** Per-retailer verified product pages */
  retailers: Array<{
    matches: (retailer: string) => boolean;
    url: string;
    /** Product title the live page returned when this URL was verified */
    verifiedAs: string;
  }>;
}

const VERIFIED_DIRECT_LINKS: VerifiedDirectLink[] = [
  {
    // Sony WH-1000XM5 Wireless Noise-Canceling Headphones
    matches: (t, m) => /wh-?1000xm5/.test(t) || /wh-?1000xm5/.test(m),
    retailers: [
      {
        matches: (r) => r.includes('best buy') || r === 'bestbuy',
        url: 'https://www.bestbuy.com/site/sony-wh-1000xm5-wireless-noise-canceling-over-the-ear-headphones-black/6505727.p?skuId=6505727',
        verifiedAs: 'Sony - WH-1000XM5 Wireless Noise Cancelling Over-the-Ear Headphones - Black'
      }
    ]
  },
  {
    // Apple MacBook Air 15" M3
    matches: (t, m) => (t.includes('macbook air') && t.includes('15') && t.includes('m3')) || m.includes('mxd13ll'),
    retailers: [
      {
        matches: (r) => r.includes('b&h') || r.includes('bh photo'),
        url: 'https://www.bhphotovideo.com/c/product/1814986-REG/apple_mxd13ll_a_15_macbook_air_m3.html',
        verifiedAs: 'Apple 15" MacBook Air (M3, Midnight)'
      }
    ]
  },
  {
    // AMD Ryzen 7 7800X3D
    matches: (t, m) => t.includes('7800x3d') || m.includes('7800x3d'),
    retailers: [
      {
        matches: (r) => r.includes('micro center') || r.includes('microcenter'),
        url: 'https://www.microcenter.com/product/674503/amd-ryzen-7-7800x3d-raphael-am5-42ghz-8-core-boxed-processor-heatsink-not-included',
        verifiedAs: 'AMD Ryzen 7 7800X3D Raphael AM5 4.2GHz 8-Core Boxed Processor - Heatsink Not Included'
      },
      {
        matches: (r) => r.includes('newegg'),
        url: 'https://www.newegg.com/amd-ryzen-7-7800x3d-ryzen-7-7000-series-raphael-zen-4-socket-am5/p/N82E16819113793',
        verifiedAs: 'AMD Ryzen 7 7800X3D - Ryzen 7 7000 Series Zen 4 8-Core 4.2 GHz Socket AM5 - 100-100000910WOF'
      }
    ]
  },
  {
    // Breville Barista Touch (BES880)
    matches: (t, m) => t.includes('barista touch') || m.includes('bes880'),
    retailers: [
      {
        matches: (r) => r.includes('breville'),
        url: 'https://www.breville.com/us/en/products/espresso/bes880.html',
        verifiedAs: 'Barista Touch - Automatic Espresso Machine with Grinder'
      }
    ]
  }
];

export function getDirectProductUrl(retailerName: string, title: string, model?: string): string | null {
  const t = (title || '').toLowerCase();
  const m = (model || '').toLowerCase();
  const r = (retailerName || '').toLowerCase().trim();

  for (const entry of VERIFIED_DIRECT_LINKS) {
    if (!entry.matches(t, m)) continue;
    for (const candidate of entry.retailers) {
      if (candidate.matches(r)) return candidate.url;
    }
  }

  return null;
}

/**
 * Validates whether a URL points to a legitimate direct product page
 * containing the retailer's genuine product identifier (e.g. ASIN, SKU, TCIN, etc.).
 * Guessed slugs that lack these identifiers (and produce 404s) return false.
 */
export function isVerifiedDirectProductUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;

  // 1. Explicit search paths are never direct product pages
  if (
    url.includes('/search') ||
    url.includes('/s?') ||
    url.includes('search?') ||
    url.includes('searchTerm=') ||
    url.includes('searchpage.jsp') ||
    url.includes('SearchDisplay') ||
    url.includes('searchresults.html') ||
    url.includes('CatalogSearch') ||
    url.includes('/p/pl?d=') ||
    url.includes('google.com/search')
  ) {
    return false;
  }

  // 2. Reject known fake guessed slugs (e.g., /ip/Text without numeric ID, /site/text without .p or skuId)
  if (/walmart\.com\/ip\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{6,}/.test(url)) return false;
  if (/bestbuy\.com\/site\/[a-zA-Z0-9_-]+$/i.test(url) && !/\.p\b/.test(url)) return false;
  if (/target\.com\/p\/[a-zA-Z0-9_-]+$/i.test(url) && !/-\/A-\d+/.test(url)) return false;
  if (/homedepot\.com\/p\/[a-zA-Z0-9_-]+$/i.test(url) && !/\/\d{6,}/.test(url)) return false;
  if (/rei\.com\/product\/[a-zA-Z0-9_-]+$/i.test(url) && !/\/product\/\d{5,}\//.test(url)) return false;
  if (/tacklewarehouse\.com\/[a-zA-Z0-9_-]+$/i.test(url) && !/descpage/.test(url)) return false;
  if (/microcenter\.com\/product\/[a-zA-Z0-9_-]+$/i.test(url) && !/\/product\/\d{5,}/.test(url)) return false;
  if (/cabelas\.com\/shop\/en\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{6,}/.test(url)) return false;
  if (/basspro\.com\/shop\/en\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{6,}/.test(url)) return false;
  if (/costco\.com\/[a-zA-Z0-9_-]+$/i.test(url) && !/\.product\./.test(url)) return false;
  if (/bhphotovideo\.com\/c\/product\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{5,}-REG/.test(url) && !/\/c\/product\/\d{5,}/.test(url)) return false;

  // 3. Match legitimate retailer direct product patterns:
  // Amazon: /dp/B0... or /gp/product/B0...
  if (/amazon\.[a-z.]+\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(url)) return true;

  // Best Buy: ends in \d{6,8}.p or has .p?skuId=\d{6,8}
  if (/bestbuy\.com\/.*(?:\d{6,8}\.p|\.p\?skuId=\d{6,8})/i.test(url)) return true;

  // Walmart: /ip/.../\d{6,12}
  if (/walmart\.com\/ip\/(?:[^/]+\/)?\d{6,12}/i.test(url)) return true;

  // Target: /p/.../-/A-\d{6,10}
  if (/target\.com\/p\/.*-\/A-\d{6,10}/i.test(url)) return true;

  // Home Depot: /p/.../\d{6,12}
  if (/homedepot\.com\/p\/(?:[^/]+\/)?\d{6,12}/i.test(url)) return true;

  // B&H Photo: /c/product/<numeric id>-REG/... (a bare slug is NOT a product id)
  if (/bhphotovideo\.com\/c\/product\/\d{5,10}-REG\//i.test(url)) return true;

  // Costco: .product.\d{6,12}.html
  if (/costco\.com\/.*\.product\.\d{6,12}\.html/i.test(url)) return true;

  // Micro Center: /product/\d{6}/
  if (/microcenter\.com\/product\/\d{6}/i.test(url)) return true;

  // Newegg: /p/N82E... or /slug/p/N82E...
  if (/newegg\.com\/(?:.*\/)?p\/[A-Z0-9]{10,20}/i.test(url)) return true;

  // REI: /product/\d{5,7}/
  if (/rei\.com\/product\/\d{5,7}\//i.test(url)) return true;

  // Backcountry: has product ID in URL
  if (/backcountry\.com\/[a-z0-9_-]+-\d{3,}/i.test(url)) return true;

  // Tackle Warehouse: /descpage-...html
  if (/tacklewarehouse\.com\/.*descpage-[A-Z0-9_-]+\.html/i.test(url)) return true;

  // Bass Pro / Cabela's: only a slug carrying a real numeric product id counts.
  // The previously whitelisted literal slugs (ugly-stik-gx2-spinning-rod,
  // garmin-echomap-uhd2-53cv, yeti-tundra-45-cooler) were verified against the
  // live sites and none of them resolve to a product page.
  if (/(?:basspro|cabelas)\.com\/shop\/en\/[a-z0-9_-]+-\d{6,12}/i.test(url)) return true;

  // Official direct brand sites
  if (/samsung\.com\/us\/.*\/[a-z0-9_-]+\/?$/i.test(url)) return true;
  if (/jackery\.com\/products\/[a-z0-9_-]+/i.test(url)) return true;
  if (/anker\.com\/products\/[a-z0-9_-]+/i.test(url)) return true;
  if (/breville\.com\/us\/en\/products\/[a-z0-9_-]+/i.test(url)) return true;
  if (/apple\.com\/.*\/buy-mac\//i.test(url)) return true;

  return false;
}

/**
 * Extracts verified retailer SKU / ASIN / ID from a direct product URL.
 */
export function extractDirectProductSku(url: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;

  // Amazon ASIN: B0... (10 characters)
  const amzMatch = url.match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (amzMatch) return amzMatch[1].toUpperCase();

  // Best Buy SKU: 7-8 digits
  const bbMatch = url.match(/(?:skuId=|\/)(\d{6,8})(?:\.p|\b)/i);
  if (bbMatch) return bbMatch[1];

  // Target TCIN: A-91456910
  const tgtMatch = url.match(/-\/A-(\d{6,10})/i);
  if (tgtMatch) return `A-${tgtMatch[1]}`;

  // Home Depot Internet ID
  const hdMatch = url.match(/homedepot\.com\/p\/(?:[^/]+\/)?(\d{6,12})/i);
  if (hdMatch) return hdMatch[1];

  // Walmart Item ID
  const wmMatch = url.match(/walmart\.com\/ip\/(?:[^/]+\/)?(\d{6,12})/i);
  if (wmMatch) return wmMatch[1];

  // B&H Photo product code
  const bhMatch = url.match(/bhphotovideo\.com\/c\/product\/([a-zA-Z0-9_-]+)/i);
  if (bhMatch) return bhMatch[1];

  // Micro Center SKU
  const mcMatch = url.match(/microcenter\.com\/product\/(\d{5,7})/i);
  if (mcMatch) return mcMatch[1];

  // Newegg Item #
  const neweggMatch = url.match(/newegg\.com\/(?:.*\/)?p\/([A-Z0-9]{10,20})/i);
  if (neweggMatch) return neweggMatch[1];

  // REI Item #
  const reiMatch = url.match(/rei\.com\/product\/(\d{5,7})/i);
  if (reiMatch) return reiMatch[1];

  return undefined;
}

/**
 * Validates whether a given retailer actually sells / stocks this specific product.
 * Strictly prevents mismatched store deals (e.g. Target does not sell Anker SOLIX C1000
 * or Breville Barista Touch, Bass Pro does not sell Osprey Atmos backpacks or CPUs).
 */
export function isRetailerSellingProduct(
  retailerName: string,
  productTitle: string,
  brand?: string,
  model?: string
): boolean {
  const r = (retailerName || '').toLowerCase().trim();
  const t = `${productTitle || ''} ${brand || ''} ${model || ''}`.toLowerCase();

  // 1. Target Restrictions:
  if (r.includes('target')) {
    // Heavy power stations & solar generators
    if (
      t.includes('solix') ||
      (t.includes('anker') && t.includes('c1000')) ||
      t.includes('jackery') ||
      t.includes('solar generator') ||
      t.includes('bluetti') ||
      t.includes('ecoflow')
    ) {
      return false;
    }
    // High-end espresso machines ($1,000 Breville Barista Touch / Oracle)
    if (t.includes('barista touch') || t.includes('bes880') || t.includes('oracle') || t.includes('barista pro')) {
      return false;
    }
    // Standalone PC components (CPUs, GPUs, motherboards)
    if (
      t.includes('7800x3d') ||
      t.includes('ryzen') ||
      t.includes('intel core') ||
      t.includes('rtx') ||
      t.includes('processor')
    ) {
      return false;
    }
    // Technical mountaineering backpacks
    if (t.includes('atmos ag 65') || t.includes('backpacking pack')) {
      return false;
    }
  }

  // 2. Bass Pro Shops & Cabela's Restrictions:
  if (r.includes('bass pro') || r.includes('basspro') || r.includes('cabela')) {
    // Technical expedition backpacking packs (Osprey, Gregory)
    if (
      t.includes('atmos ag 65') ||
      (t.includes('osprey') && (t.includes('atmos') || t.includes('aether') || t.includes('exos') || t.includes('backpack')))
    ) {
      return false;
    }
    // Technical ultralight backpacking tents & pads
    if (t.includes('copper spur') || t.includes('neoair') || t.includes('big agnes') || t.includes('therm-a-rest')) {
      return false;
    }
    // PC components, TVs, robot vacuums, Dyson, coffee makers
    if (
      t.includes('7800x3d') ||
      t.includes('ryzen') ||
      t.includes('oled') ||
      t.includes('tv') ||
      t.includes('dyson') ||
      t.includes('macbook') ||
      t.includes('playstation') ||
      t.includes('ps5') ||
      t.includes('wh-1000xm5') ||
      t.includes('breville') ||
      t.includes('dewalt')
    ) {
      return false;
    }
  }

  // 3. REI Restrictions:
  if (r.includes('rei')) {
    // REI does NOT sell PC parts, televisions, power drills, or kitchen espresso makers
    if (
      t.includes('7800x3d') ||
      t.includes('ryzen') ||
      t.includes('oled') ||
      t.includes('tv') ||
      t.includes('dyson') ||
      t.includes('dewalt') ||
      t.includes('drill') ||
      t.includes('breville') ||
      t.includes('barista') ||
      t.includes('playstation') ||
      t.includes('ps5') ||
      t.includes('macbook')
    ) {
      return false;
    }
  }

  // 4. Micro Center Restrictions:
  if (r.includes('micro center') || r.includes('microcenter')) {
    // Micro Center does NOT sell outdoor backpacking, fishing, camping, or home appliances
    if (
      t.includes('ugly stik') ||
      t.includes('fishing') ||
      t.includes('stradic') ||
      t.includes('atmos') ||
      t.includes('backpack') ||
      t.includes('tent') ||
      t.includes('tundra') ||
      t.includes('cooler') ||
      t.includes('dyson') ||
      t.includes('drill') ||
      t.includes('dewalt') ||
      t.includes('breville') ||
      t.includes('garmin inreach')
    ) {
      return false;
    }
  }

  // 5. Tackle Warehouse Restrictions:
  if (r.includes('tackle warehouse') || r.includes('tacklewarehouse')) {
    // Tackle Warehouse is strictly fishing gear
    if (
      !t.includes('fishing') &&
      !t.includes('rod') &&
      !t.includes('reel') &&
      !t.includes('stradic') &&
      !t.includes('ugly stik') &&
      !t.includes('tackle') &&
      !t.includes('lure') &&
      !t.includes('line')
    ) {
      return false;
    }
  }

  // 6. Home Depot Restrictions:
  if (r.includes('home depot') || r.includes('homedepot')) {
    // Home Depot does NOT sell video game consoles, premium audio, fishing gear, or laptops
    if (
      t.includes('wh-1000xm5') ||
      t.includes('headphone') ||
      t.includes('airpods') ||
      t.includes('playstation') ||
      t.includes('ps5') ||
      t.includes('fishing') ||
      t.includes('stradic') ||
      t.includes('atmos') ||
      t.includes('macbook')
    ) {
      return false;
    }
  }

  // 7. Best Buy Restrictions:
  if (r.includes('best buy') || r === 'bestbuy') {
    // Best Buy does NOT sell fishing rods, reels, or expedition backpacks
    if (
      t.includes('ugly stik') ||
      t.includes('fishing rod') ||
      t.includes('stradic') ||
      t.includes('atmos ag 65') ||
      t.includes('copper spur')
    ) {
      return false;
    }
  }

  // 8. Costco Restrictions:
  if (r.includes('costco')) {
    // Costco does NOT sell standalone PC desktop processors / components
    if (
      t.includes('7800x3d') ||
      t.includes('ryzen') ||
      t.includes('pc components') ||
      t.includes('cpu') ||
      t.includes('processor')
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a URL is an official retailer catalog search endpoint
 */
export function isOfficialSearchUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  return (
    url.includes('/search') ||
    url.includes('search?') ||
    url.includes('searchTerm=') ||
    url.includes('searchpage.jsp') ||
    url.includes('SearchDisplay') ||
    url.includes('searchresults.html') ||
    url.includes('CatalogSearch') ||
    url.includes('/s?k=') ||
    url.includes('/s?searchTerm=') ||
    url.includes('/p/pl?d=') ||
    // Home Depot's catalog search lives at /s/<query>, not /search
    /homedepot\.com\/s\//i.test(url) ||
    url.includes('google.com/search?tbm=shop')
  );
}

/**
 * Flags known broken guessed slugs that lack required numeric identifiers
 */
export function detectBrokenGuessedSlug(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (/walmart\.com\/ip\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{6,}/.test(url)) return true;
  if (/bestbuy\.com\/site\/[a-zA-Z0-9_-]+$/i.test(url) && !/\.p\b/.test(url)) return true;
  if (/target\.com\/p\/[a-zA-Z0-9_-]+$/i.test(url) && !/-\/A-\d+/.test(url)) return true;
  if (/homedepot\.com\/p\/[a-zA-Z0-9_-]+$/i.test(url) && !/\/\d{6,}/.test(url)) return true;
  if (/rei\.com\/product\/[a-zA-Z0-9_-]+$/i.test(url) && !/\/product\/\d{5,}\//.test(url)) return true;
  if (/tacklewarehouse\.com\/[a-zA-Z0-9_-]+$/i.test(url) && !/descpage/.test(url)) return true;
  if (/microcenter\.com\/product\/[a-zA-Z0-9_-]+$/i.test(url) && !/\/product\/\d{5,}/.test(url)) return true;
  if (/cabelas\.com\/shop\/en\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{6,}/.test(url)) return true;
  if (/basspro\.com\/shop\/en\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{6,}/.test(url)) return true;
  if (/costco\.com\/[a-zA-Z0-9_-]+$/i.test(url) && !/\.product\./.test(url)) return true;
  if (/bhphotovideo\.com\/c\/product\/[a-zA-Z0-9_-]+$/i.test(url) && !/\d{5,}-REG/.test(url) && !/\/c\/product\/\d{5,}/.test(url)) return true;
  if (/backcountry\.com\/[a-zA-Z0-9_-]+$/i.test(url) && !/-\d{3,}/.test(url)) return true;
  return false;
}

/**
 * Constructs a guaranteed working, high-precision official catalog search URL
 * for any retailer.
 */
export function buildStorefrontSearchUrl(
  retailerName: string,
  productTitle: string,
  brand?: string,
  model?: string
): string {
  const query = encodeURIComponent(cleanSearchQuery(productTitle, brand, model));
  const nameLower = (retailerName || '').toLowerCase().trim();

  // 1. Costco
  if (nameLower.includes('costco')) {
    return `https://www.costco.com/CatalogSearch?dept=All&keyword=${query}`;
  }

  // 2. Best Buy (When exact model is used, Best Buy searches or redirects directly)
  if (nameLower.includes('best buy') || nameLower === 'bestbuy') {
    return `https://www.bestbuy.com/site/searchpage.jsp?st=${query}`;
  }

  // 3. Walmart
  if (nameLower.includes('walmart')) {
    return `https://www.walmart.com/search?q=${query}`;
  }

  // 4. Target
  if (nameLower.includes('target')) {
    return `https://www.target.com/s?searchTerm=${query}`;
  }

  // 5. Amazon
  if (nameLower.includes('amazon')) {
    return `https://www.amazon.com/s?k=${query}`;
  }

  // 6. REI
  if (nameLower.includes('rei')) {
    return `https://www.rei.com/search?q=${query}`;
  }

  // 7. Bass Pro Shops
  if (nameLower.includes('bass pro') || nameLower === 'basspro') {
    return `https://www.basspro.com/shop/en/SearchDisplay?searchTerm=${query}`;
  }

  // 8. Cabela's
  if (nameLower.includes("cabela")) {
    return `https://www.cabelas.com/shop/en/SearchDisplay?searchTerm=${query}`;
  }

  // 9. Tackle Warehouse
  if (nameLower.includes('tackle warehouse') || nameLower === 'tacklewarehouse') {
    return `https://www.tacklewarehouse.com/searchresults.html?search=${query}`;
  }

  // 10. Backcountry
  if (nameLower.includes('backcountry')) {
    return `https://www.backcountry.com/Store/catalog/search.jsp?q=${query}`;
  }

  // 11. B&H Photo
  if (nameLower.includes('b&h') || nameLower.includes('bh photo') || nameLower === 'bh') {
    return `https://www.bhphotovideo.com/c/search?Ntt=${query}`;
  }

  // 12. Newegg
  if (nameLower.includes('newegg')) {
    return `https://www.newegg.com/p/pl?d=${query}`;
  }

  // 13. Home Depot
  if (nameLower.includes('home depot') || nameLower === 'homedepot') {
    return `https://www.homedepot.com/s/${query}`;
  }

  // 14. Micro Center
  if (nameLower.includes('micro center') || nameLower.includes('microcenter')) {
    return `https://www.microcenter.com/search/search_results.aspx?Ntt=${query}`;
  }

  // 15. Dick's Sporting Goods
  if (nameLower.includes('dick') || nameLower.includes('sporting goods')) {
    return `https://www.dickssportinggoods.com/search/SearchDisplay?searchTerm=${query}`;
  }

  // Default fallback to Google Shopping for verified live merchant pricing
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${retailerName} ${cleanSearchQuery(productTitle, brand, model)}`)}`;
}

/**
 * Main resolution function.
 * Ensures that broken guessed slugs are never served, verified URLs are preserved,
 * and search fallbacks are precision-crafted.
 */
export function getRetailerDealUrl(
  retailerName: string,
  productTitle: string,
  existingUrl?: string,
  brand?: string,
  model?: string
): string {
  // Step 1: Check known verified direct product URL registry first
  const directRegisteredUrl = getDirectProductUrl(retailerName, productTitle, model);
  if (directRegisteredUrl) {
    return directRegisteredUrl;
  }

  // Step 2: Preserve any valid direct product URL that was already supplied with authentic IDs
  if (existingUrl && isVerifiedDirectProductUrl(existingUrl)) {
    return existingUrl;
  }

  // Step 3: Preserve official store search URLs if already correctly populated
  if (existingUrl && isOfficialSearchUrl(existingUrl)) {
    return existingUrl;
  }

  // Step 4: Discard broken guessed slugs and fallback to high-precision search
  return buildStorefrontSearchUrl(retailerName, productTitle, brand, model);
}

/**
 * Returns full classification details for a retailer link so the UI can
 * transparently inform the user whether a link is a direct product page
 * or a live store search.
 */
export function getRetailerLinkDetails(
  retailerName: string,
  productTitle: string,
  existingUrl?: string,
  brand?: string,
  model?: string
): RetailerLinkDetails {
  const isSelling = isRetailerSellingProduct(retailerName, productTitle, brand, model);
  const url = getRetailerDealUrl(retailerName, productTitle, existingUrl, brand, model);
  const isDirect = isSelling && isVerifiedDirectProductUrl(url);
  const directSku = isDirect ? extractDirectProductSku(url) : undefined;

  return {
    url,
    type: isDirect ? 'direct_product' : 'catalog_search',
    isDirect,
    productMatchVerified: isDirect,
    matchStatus: isDirect ? 'verified_exact' : isSelling ? 'unverified_search' : 'not_stocked',
    badgeLabel: isDirect ? 'Direct' : isSelling ? 'Search' : 'No Listing',
    tooltip: isDirect 
      ? `Verified direct product page on ${retailerName}${directSku ? ` (${directSku})` : ''}`
      : isSelling
        ? `Live catalog search for '${cleanSearchQuery(productTitle, brand, model)}' on ${retailerName}`
        : `${retailerName} does not stock this item`,
    actionText: isDirect ? `Buy at ${retailerName}` : isSelling ? `Search ${retailerName}` : `Search ${retailerName}`,
    directSku
  };
}
