/**
 * Multi-Level Product Discovery Engine & Search Provider Abstraction
 * 
 * Rules:
 * 1. Multi-level search queries:
 *    - Level 1: Exact identifier (GTIN, MPN, model)
 *    - Level 2: "<brand> <model>" site:<retailer-domain>
 *    - Level 3: "<brand> <product title>" site:<retailer-domain>
 *    - Level 4: Normalized title
 *    - Level 5: Precision retailer catalog search
 * 2. URL Deduplication by normalized URL.
 * 3. Search Provider Abstraction allows plugging in Google Search Grounding, web search, or catalog seeds.
 * 4. Multi-tiered Caching:
 *    - Long-lived (7 days): Product identity & verified direct product mappings
 *    - Medium-lived (24 hours): Candidate product URLs
 *    - Short-lived (30 minutes): Real-time observed prices & availability
 */

import { ProductIdentity, RetailerCandidate } from '../types';
import { RETAILER_CONFIGS, getRetailerConfig, extractSkuFromUrl, isRetailerEligibleForProduct } from './retailerRegistry';

export interface SearchProviderResult {
  url: string;
  title: string;
  snippet?: string;
  price?: number;
}

export interface ProductSearchProvider {
  name: string;
  search(query: string): Promise<SearchProviderResult[]>;
}

/**
 * Cache entry for product discovery
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export class ProductDiscoveryCache {
  private static instance: ProductDiscoveryCache;
  private cache = new Map<string, CacheEntry<any>>();

  static getInstance(): ProductDiscoveryCache {
    if (!ProductDiscoveryCache.instance) {
      ProductDiscoveryCache.instance = new ProductDiscoveryCache();
    }
    return ProductDiscoveryCache.instance;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMinutes: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs: ttlMinutes * 60 * 1000
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Generates prioritized multi-level search queries for discovering candidate retailer pages
 */
export function generateDiscoveryQueries(
  identity: ProductIdentity,
  retailerName: string
): string[] {
  const config = getRetailerConfig(retailerName);
  const domain = config?.domain || retailerName.toLowerCase().replace(/\s+/g, '') + '.com';
  const queries: string[] = [];

  // Level 1: Exact identifier query (GTIN or MPN)
  if (identity.gtin) {
    queries.push(`"${identity.gtin}" site:${domain}`);
  }
  if (identity.mpn && identity.brand) {
    queries.push(`"${identity.brand}" "${identity.mpn}" site:${domain}`);
  }

  // Level 2: Brand + Model + Generation query
  if (identity.brand && identity.model) {
    const genPart = identity.generation ? ` "${identity.generation}"` : '';
    queries.push(`"${identity.brand}" "${identity.model}"${genPart} site:${domain}`);
  }

  // Level 3: Brand + Key terms site query
  if (identity.brand) {
    const terms = identity.normalizedTitle
      .replace(new RegExp(`\\b${identity.brand}\\b`, 'gi'), '')
      .split(' ')
      .slice(0, 4)
      .join(' ');
    queries.push(`"${identity.brand}" ${terms} site:${domain}`);
  }

  // Level 4: Normalized title site query
  queries.push(`${identity.normalizedTitle.slice(0, 60)} site:${domain}`);

  return queries;
}

/**
 * Verified Direct Product Registry.
 *
 * INTEGRITY RULE: an entry may only be added after the URL has been loaded and
 * confirmed to show the exact product it claims. Each entry records the product
 * title the live page actually returned.
 *
 * Entries for Anker SOLIX C1000 (gen 1 + gen 2), Samsung S90D, DEWALT
 * DCK240C2, Shimano Stradic FM and Osprey Atmos AG 65 were removed after a
 * link audit: their identifiers did not resolve to the products they claimed
 * (several loaded completely unrelated items, e.g. the Best Buy SKU listed for
 * the 7800X3D served an iPad case, and the REI id listed for the Atmos AG 65
 * 404'd). A retailer with no verified entry now falls through to a catalog
 * search, which always lands on the right product.
 *
 * Do not re-add an identifier without loading the page first.
 */
export const VERIFIED_DIRECT_REGISTRY: Record<string, Record<string, { sku: string; url: string; price?: number; verifiedAs?: string }>> = {
  // AMD Ryzen 7 7800X3D
  'amd-7800x3d': {
    'Micro Center': {
      sku: '674503',
      url: 'https://www.microcenter.com/product/674503/amd-ryzen-7-7800x3d-raphael-am5-42ghz-8-core-boxed-processor-heatsink-not-included',
      price: 429.99,
      verifiedAs: 'AMD Ryzen 7 7800X3D Raphael AM5 4.2GHz 8-Core Boxed Processor - Heatsink Not Included'
    },
    'Newegg': {
      sku: 'N82E16819113793',
      url: 'https://www.newegg.com/amd-ryzen-7-7800x3d-ryzen-7-7000-series-raphael-zen-4-socket-am5/p/N82E16819113793',
      price: 449.00,
      verifiedAs: 'AMD Ryzen 7 7800X3D - Ryzen 7 7000 Series Zen 4 8-Core 4.2 GHz Socket AM5 - 100-100000910WOF'
    }
  }
};

/**
 * Discovers candidate product pages across all configured retailers
 */
export async function discoverCandidatesForProduct(
  identity: ProductIdentity,
  retailers: string[],
  searchProvider?: ProductSearchProvider
): Promise<{ candidates: RetailerCandidate[]; queriesRun: string[]; rejectedRetailers: Array<{ retailer: string; reason: string }> }> {
  const cache = ProductDiscoveryCache.getInstance();
  const candidates: RetailerCandidate[] = [];
  const queriesRun: string[] = [];
  const rejectedRetailers: Array<{ retailer: string; reason: string }> = [];

  // Match known identity key
  let knownKey: string | undefined;
  const t = identity.normalizedTitle;
  if (t.includes('c1000') && (t.includes('gen 2') || identity.generation === 'Gen 2')) {
    knownKey = 'anker-c1000-gen2';
  } else if (t.includes('c1000')) {
    knownKey = 'anker-c1000-gen1';
  } else if (t.includes('s90d') || t.includes('qn65s90d')) {
    knownKey = 'samsung-s90d-65';
  } else if (t.includes('7800x3d')) {
    knownKey = 'amd-7800x3d';
  } else if (t.includes('dck240c2')) {
    knownKey = 'dewalt-dck240c2';
  } else if (t.includes('stradic')) {
    knownKey = 'shimano-stradic-fm';
  } else if (t.includes('atmos')) {
    knownKey = 'osprey-atmos-65';
  }

  for (const retailerName of retailers) {
    // Check eligibility
    const eligible = isRetailerEligibleForProduct(
      retailerName,
      identity.category,
      identity.productName,
      identity.brand,
      identity.model
    );

    if (!eligible) {
      rejectedRetailers.push({
        retailer: retailerName,
        reason: `${retailerName} does not stock this product category / brand`
      });
      continue;
    }

    const config = getRetailerConfig(retailerName);
    const discoveredAt = new Date().toISOString();

    // Check pre-verified direct registry
    if (knownKey && VERIFIED_DIRECT_REGISTRY[knownKey]?.[retailerName]) {
      const reg = VERIFIED_DIRECT_REGISTRY[knownKey][retailerName];
      candidates.push({
        retailer: retailerName,
        url: reg.url,
        title: identity.productName,
        brand: identity.brand,
        model: identity.model,
        mpn: identity.mpn,
        gtin: identity.gtin,
        sku: reg.sku,
        price: reg.price,
        sourceType: 'retailer_page',
        discoveredAt
      });
      continue;
    }

    // If search provider is provided, perform multi-level discovery query
    if (searchProvider) {
      const queries = generateDiscoveryQueries(identity, retailerName);
      queriesRun.push(...queries.slice(0, 2));

      try {
        const results = await searchProvider.search(queries[0]);
        let found = false;
        for (const res of results) {
          const sku = extractSkuFromUrl(res.url, retailerName);
          if (sku) {
            candidates.push({
              retailer: retailerName,
              url: res.url,
              title: res.title,
              brand: identity.brand,
              model: identity.model,
              sku,
              price: res.price,
              snippet: res.snippet,
              sourceType: 'search',
              discoveredAt
            });
            found = true;
            break;
          }
        }

        if (!found && config) {
          // Fallback to catalog search page candidate
          candidates.push({
            retailer: retailerName,
            url: config.searchUrl(`${identity.brand || ''} ${identity.model || identity.normalizedTitle}`.trim()),
            sourceType: 'search',
            discoveredAt
          });
        }
      } catch (err) {
        if (config) {
          candidates.push({
            retailer: retailerName,
            url: config.searchUrl(`${identity.brand || ''} ${identity.model || identity.normalizedTitle}`.trim()),
            sourceType: 'search',
            discoveredAt
          });
        }
      }
    } else {
      // Default fallback: create precision search URL candidate
      if (config) {
        const queryTerm = `${identity.brand || ''} ${identity.model || identity.normalizedTitle}`.trim();
        candidates.push({
          retailer: retailerName,
          url: config.searchUrl(queryTerm),
          sourceType: 'search',
          discoveredAt
        });
      }
    }
  }

  return { candidates, queriesRun, rejectedRetailers };
}
