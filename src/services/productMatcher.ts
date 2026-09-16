/**
 * Dedicated Exact Product Matching Engine
 * 
 * Rules:
 * 1. A Google search result is NOT proof of an exact product match.
 * 2. A retailer search URL is NOT an exact product URL.
 * 3. Title looking similar is NOT sufficient for an exact match.
 * 4. Never invent GTIN, UPC, ASIN, SKU, or MPN.
 * 5. Bundles (e.g. + solar panel, + lens) must NEVER silently match standalone products.
 * 6. Generational mismatches (Gen 1 vs Gen 2, M3 vs M4) must be classified as wrong_product.
 */

import { ProductIdentity, RetailerCandidate, ProductMatchResult, LinkType } from '../types';
import { areGenerationsCompatible, areCapacitiesCompatible, normalizeProductIdentity } from './productIdentity';

/**
 * Evaluates candidate product page against canonical requested ProductIdentity
 */
export function matchCandidateProduct(
  requested: ProductIdentity,
  candidate: RetailerCandidate
): ProductMatchResult {
  const reasons: string[] = [];
  const matchedIdentifiers: string[] = [];
  const mismatches: string[] = [];

  // Check if candidate is merely a search result URL
  const isSearchPage = isUrlSearchPage(candidate.url);
  if (isSearchPage) {
    return {
      status: 'search_only',
      confidence: 45,
      reasons: ['Candidate URL is a retailer catalog search endpoint, not a direct product page'],
      matchedIdentifiers: [],
      mismatches: ['Page type is catalog_search instead of verified_product']
    };
  }

  // Parse candidate identity if candidate has title
  const candidateIdentity = candidate.title
    ? normalizeProductIdentity({
        title: candidate.title,
        brand: candidate.brand,
        model: candidate.model,
        mpn: candidate.mpn,
        gtin: candidate.gtin
      })
    : undefined;

  let confidence = 50;
  let status: ProductMatchResult['status'] = 'probable';
  let isBundleMismatch = false;
  let isGenerationMismatch = false;
  let isCapacityMismatch = false;

  // 1. GTIN / UPC / EAN Check (Highest Priority)
  if (requested.gtin && candidate.gtin) {
    const cleanReqGtin = requested.gtin.replace(/[^0-9]/g, '');
    const cleanCandGtin = candidate.gtin.replace(/[^0-9]/g, '');
    if (cleanReqGtin === cleanCandGtin && cleanReqGtin.length >= 8) {
      matchedIdentifiers.push(`GTIN: ${requested.gtin}`);
      reasons.push(`✓ Exact GTIN/UPC match (${requested.gtin})`);
      confidence = 99;
      return {
        status: 'exact',
        confidence,
        reasons,
        matchedIdentifiers,
        mismatches
      };
    } else {
      mismatches.push(`GTIN mismatch: requested ${requested.gtin} vs found ${candidate.gtin}`);
      return {
        status: 'wrong_product',
        confidence: 10,
        reasons: [`✗ Distinct GTIN mismatch: requested ${requested.gtin} vs found ${candidate.gtin}`],
        matchedIdentifiers,
        mismatches
      };
    }
  }

  // 2. MPN Check (Manufacturer Part Number)
  if (requested.mpn && candidate.mpn) {
    const cleanReqMpn = requested.mpn.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanCandMpn = candidate.mpn.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanReqMpn === cleanCandMpn) {
      matchedIdentifiers.push(`MPN: ${requested.mpn}`);
      reasons.push(`✓ Exact MPN match (${requested.mpn})`);
      confidence = 98;
      status = 'exact';
    } else {
      mismatches.push(`MPN mismatch: requested ${requested.mpn} vs found ${candidate.mpn}`);
      return {
        status: 'wrong_product',
        confidence: 15,
        reasons: [`✗ Distinct MPN mismatch: requested ${requested.mpn} vs found ${candidate.mpn}`],
        matchedIdentifiers,
        mismatches
      };
    }
  }

  // 3. Bundle Detection Check
  // If requested is standalone, but candidate is a bundle, reject as wrong_product
  const candTitle = (candidate.title || '').toLowerCase();
  const candIsBundle = candidateIdentity?.isBundle || 
    /(?:with|\+)\s*(?:[0-9]+\s*w(?:att)?\s*solar\s*panel|extra\s*battery|lens\s*kit|expansion)/i.test(candTitle);

  if (!requested.isBundle && candIsBundle) {
    isBundleMismatch = true;
    mismatches.push('Bundle mismatch: Requested standalone item, but candidate is bundled with accessories');
    return {
      status: 'wrong_product',
      confidence: 20,
      reasons: ['✗ Candidate contains additional bundle components not in requested standalone item'],
      matchedIdentifiers,
      mismatches,
      isBundleMismatch: true
    };
  }

  // 4. Generation Compatibility Check (Gen 1 vs Gen 2, M3 vs M4)
  const candGen = candidateIdentity?.generation || extractGenerationFromText(candTitle);
  if (requested.generation && candGen) {
    if (!areGenerationsCompatible(requested.generation, candGen)) {
      isGenerationMismatch = true;
      mismatches.push(`Generation mismatch: requested ${requested.generation} vs found ${candGen}`);
      return {
        status: 'wrong_product',
        confidence: 15,
        reasons: [`✗ Generation mismatch: requested ${requested.generation} vs found ${candGen}`],
        matchedIdentifiers,
        mismatches,
        isGenerationMismatch: true
      };
    } else {
      matchedIdentifiers.push(`Generation: ${requested.generation}`);
      reasons.push(`✓ Generation matches (${requested.generation})`);
    }
  }

  // 5. Capacity / Size Compatibility Check (1000Wh vs 2000Wh, 13" vs 15")
  const candCap = candidateIdentity?.capacity || extractCapacityFromText(candTitle);
  if (requested.capacity && candCap) {
    if (!areCapacitiesCompatible(requested.capacity, candCap)) {
      isCapacityMismatch = true;
      mismatches.push(`Capacity mismatch: requested ${requested.capacity} vs found ${candCap}`);
      return {
        status: 'wrong_product',
        confidence: 18,
        reasons: [`✗ Capacity/Size mismatch: requested ${requested.capacity} vs found ${candCap}`],
        matchedIdentifiers,
        mismatches,
        isCapacityMismatch: true
      };
    } else {
      matchedIdentifiers.push(`Capacity: ${requested.capacity}`);
      reasons.push(`✓ Capacity matches (${requested.capacity})`);
    }
  }

  // 6. Brand Matching
  if (requested.brand) {
    const candBrand = candidate.brand || candidateIdentity?.brand || '';
    if (candBrand && candBrand.toLowerCase() === requested.brand.toLowerCase()) {
      matchedIdentifiers.push(`Brand: ${requested.brand}`);
      reasons.push(`✓ Brand matches (${requested.brand})`);
      confidence += 15;
    } else if (candTitle.includes(requested.brand.toLowerCase())) {
      matchedIdentifiers.push(`Brand in title: ${requested.brand}`);
      reasons.push(`✓ Brand present in title (${requested.brand})`);
      confidence += 10;
    } else {
      mismatches.push(`Brand mismatch: requested ${requested.brand}`);
      return {
        status: 'wrong_product',
        confidence: 10,
        reasons: [`✗ Brand mismatch: requested ${requested.brand}`],
        matchedIdentifiers,
        mismatches
      };
    }
  }

  // 7. Model Matching
  if (requested.model) {
    const cleanModel = requested.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanCandTitle = candTitle.replace(/[^a-z0-9]/g, '');
    if (cleanCandTitle.includes(cleanModel)) {
      matchedIdentifiers.push(`Model: ${requested.model}`);
      reasons.push(`✓ Exact Model found in candidate (${requested.model})`);
      confidence += 25;
      status = confidence >= 90 ? 'exact' : 'strong';
    } else {
      // Check partial model tokens
      const modelTokens = requested.model.toLowerCase().split(/[\s-]+/).filter(t => t.length >= 3);
      const allTokensPresent = modelTokens.length > 0 && modelTokens.every(tok => cleanCandTitle.includes(tok));
      if (allTokensPresent) {
        matchedIdentifiers.push(`Model tokens: ${requested.model}`);
        reasons.push(`✓ Core model identifier tokens match (${requested.model})`);
        confidence += 20;
        status = 'strong';
      } else {
        mismatches.push(`Model number ${requested.model} not confirmed in candidate`);
      }
    }
  }

  // If candidate has direct product SKU (ASIN, Best Buy SKU, etc.)
  if (candidate.sku) {
    matchedIdentifiers.push(`Direct SKU: ${candidate.sku}`);
    reasons.push(`✓ Direct product landing page confirmed (${candidate.sku})`);
    confidence += 10;
  }

  // Final confidence clamping & status assignment
  confidence = Math.min(Math.max(confidence, 0), 100);

  if (confidence >= 90) {
    status = 'exact';
  } else if (confidence >= 75) {
    status = 'strong';
  } else if (confidence >= 60) {
    status = 'probable';
  } else {
    status = 'wrong_product';
  }

  return {
    status,
    confidence,
    reasons,
    matchedIdentifiers,
    mismatches,
    isBundleMismatch,
    isGenerationMismatch,
    isCapacityMismatch
  };
}

/**
 * Determines whether a URL is a catalog search results page or a direct candidate
 */
export function isUrlSearchPage(url: string): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return (
    u.includes('/s?k=') ||
    u.includes('/search') ||
    u.includes('searchpage.jsp') ||
    u.includes('/catalogsearch') ||
    u.includes('/p/pl?d=') ||
    u.includes('?ntt=') ||
    u.includes('searchterm=') ||
    u.includes('tbm=shop')
  );
}

/**
 * Classifies link type based on URL and match results
 */
export function determineLinkType(url: string, match?: ProductMatchResult | string): LinkType {
  if (isUrlSearchPage(url)) {
    return 'search_results';
  }
  if (match && typeof match !== 'string') {
    if (match.status === 'exact' || match.status === 'strong') {
      return 'verified_product';
    }
  }
  return 'unknown';
}

function extractGenerationFromText(text: string): string | undefined {
  const genMatch = text.match(/\b(Gen(?:eration)?\s*([0-9]+)|(?:[0-9]+)(?:st|nd|rd|th)\s*Gen(?:eration)?)\b/i);
  if (genMatch) {
    const num = genMatch[0].match(/[0-9]+/);
    return num ? `Gen ${num[0]}` : genMatch[0];
  }
  if (/\bM[1-4]\b/i.test(text)) {
    const m = text.match(/\bM[1-4]\b/i);
    return m ? m[0].toUpperCase() : undefined;
  }
  return undefined;
}

function extractCapacityFromText(text: string): string | undefined {
  const wh = text.match(/\b([0-9]+(?:,[0-9]+)?)\s*Wh\b/i);
  if (wh) return `${wh[1].replace(',', '')}Wh`;
  const gb = text.match(/\b([0-9]+)\s*(?:GB|TB)\b/i);
  if (gb) return gb[0].toUpperCase();
  return undefined;
}
