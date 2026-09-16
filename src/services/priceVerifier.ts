/**
 * Price & Evidence Verification Engine
 * 
 * Strict Directives:
 * 1. A current price must be associated with evidence.
 * 2. NEVER invent a current retailer price or retailer product URL.
 * 3. Never manufacture retailer prices using `basePrice * (1 + variation)`.
 * 4. If PriceRadar cannot verify that a retailer actually sells the requested product,
 *    do not display a fake price. Display "No verified listing found" or search link, with price null.
 * 5. A historical low is NOT today's price.
 */

import { ProductIdentity, RetailerCandidate, ProductMatchResult, VerifiedPrice, LinkType } from '../types';
import { matchCandidateProduct, determineLinkType } from './productMatcher';
import { isRetailerEligibleForProduct, extractSkuFromUrl } from './retailerRegistry';

export interface VerificationInput {
  requestedProduct: ProductIdentity;
  retailerName: string;
  candidateUrl?: string;
  candidate?: RetailerCandidate;
}

/**
 * Verifies a retailer price offer against canonical product identity
 */
export function verifyRetailerPrice(input: VerificationInput): VerifiedPrice {
  const { requestedProduct, retailerName, candidateUrl, candidate } = input;
  const observedAt = new Date().toISOString();

  // 1. Retailer Eligibility Check
  const eligible = isRetailerEligibleForProduct(
    retailerName,
    requestedProduct.category,
    requestedProduct.productName,
    requestedProduct.brand,
    requestedProduct.model
  );

  if (!eligible) {
    return {
      retailer: retailerName,
      price: null,
      currency: 'USD',
      url: candidateUrl || '',
      linkType: 'unknown',
      productMatch: {
        status: 'not_found',
        confidence: 0,
        reasons: [`${retailerName} does not stock or sell this product category / brand`],
        matchedIdentifiers: [],
        mismatches: ['Retailer eligibility check failed']
      },
      source: 'retailer_page',
      observedAt,
      priceVerified: false,
      productVerified: false,
      evidence: {
        matchingNotes: `Retailer ${retailerName} does not carry this product catalog.`
      }
    };
  }

  // 2. Candidate Evaluation
  if (!candidate && !candidateUrl) {
    return {
      retailer: retailerName,
      price: null,
      currency: 'USD',
      url: '',
      linkType: 'unknown',
      productMatch: {
        status: 'not_found',
        confidence: 0,
        reasons: ['No candidate product listing found for retailer'],
        matchedIdentifiers: [],
        mismatches: ['No listing found']
      },
      source: 'retailer_page',
      observedAt,
      priceVerified: false,
      productVerified: false
    };
  }

  // Build candidate if not provided
  const activeCandidate: RetailerCandidate = candidate || {
    retailer: retailerName,
    url: candidateUrl!,
    sourceType: 'search',
    discoveredAt: observedAt,
    sku: extractSkuFromUrl(candidateUrl!, retailerName)
  };

  // 3. Exact Product Match
  const matchResult: ProductMatchResult = matchCandidateProduct(requestedProduct, activeCandidate);
  const linkType: LinkType = determineLinkType(activeCandidate.url, matchResult);

  // 4. Product Verification Check
  const productVerified = (matchResult.status === 'exact' || matchResult.status === 'strong') && linkType === 'verified_product';

  // 5. Price Verification:
  // ONLY mark price verified if product is verified AND candidate has an observed real price
  const rawPrice = activeCandidate.price;
  const priceVerified = productVerified && typeof rawPrice === 'number' && rawPrice > 0;

  const directSku = activeCandidate.sku || extractSkuFromUrl(activeCandidate.url, retailerName);

  return {
    retailer: retailerName,
    price: priceVerified ? rawPrice! : null,
    currency: activeCandidate.currency || 'USD',
    url: activeCandidate.url,
    linkType,
    productMatch: matchResult,
    source: activeCandidate.sourceType === 'structured_data' ? 'structured_data' : 'retailer_page',
    observedAt,
    priceVerified,
    productVerified,
    directSku,
    inStock: activeCandidate.availability !== 'out_of_stock',
    stockMessage: activeCandidate.availability || (priceVerified ? 'Verified In Stock' : 'Availability Unverified'),
    shipping: 'Standard Shipping',
    shippingCost: 0,
    evidence: {
      title: activeCandidate.title,
      productId: directSku,
      priceText: rawPrice ? `$${rawPrice.toFixed(2)}` : undefined,
      availabilityText: activeCandidate.availability,
      matchingNotes: matchResult.reasons.join(' • ')
    }
  };
}

/**
 * Evaluates whether an alert condition is legitimately met.
 * Alert triggers ONLY when both product and price are verified.
 */
export function isDealAlertTriggered(
  verifiedPrice: VerifiedPrice,
  targetPrice?: number,
  allTimeLow?: number
): { triggered: boolean; reason?: string } {
  if (!verifiedPrice.priceVerified || verifiedPrice.price === null) {
    return { triggered: false, reason: 'Price is not verified' };
  }

  if (targetPrice && verifiedPrice.price <= targetPrice) {
    return {
      triggered: true,
      reason: `Verified price $${verifiedPrice.price.toFixed(2)} is at or below target $${targetPrice.toFixed(2)}`
    };
  }

  if (allTimeLow && verifiedPrice.price <= allTimeLow) {
    return {
      triggered: true,
      reason: `Verified price $${verifiedPrice.price.toFixed(2)} matches or beats all-time low $${allTimeLow.toFixed(2)}`
    };
  }

  return { triggered: false };
}
