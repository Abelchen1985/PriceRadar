/**
 * Offers: the unit of truth for "you can buy this thing, here, for this much".
 *
 * The model is taken from how a mature parts-pricing site works. Their unit is
 * not the product, it is the OFFER: a row that binds one merchant, one exact
 * merchant URL, one price, one stock state and one timestamp, and that exists
 * only because something actually observed it. If nothing observed an offer,
 * the merchant simply does not appear. No price is ever shown that was not
 * observed, and no URL is ever shown that was not handed over by a source.
 *
 * That is the opposite of building a link from a product title and hoping the
 * store's search page finds something. A constructed search URL is a fine way
 * to help someone go LOOK for a product; it is not an offer, it carries no
 * price, and it must never be presented as one.
 *
 * Hence the two-tier split enforced in this file:
 *   Offer      - observed. Has a URL, a source, a timestamp. May be shown with
 *                a price, and may carry a "Buy" action.
 *   SearchLink - constructed. Has a URL and nothing else. Shown as "find it at
 *                <store>", never with a price, never as a deal.
 */

export type OfferSource =
  | 'retailer_api'      // a retailer's own API handed us the URL and price
  | 'structured_data'   // schema.org Product JSON-LD read off the product page
  | 'browser_capture'   // captured from a real browser session by the bookmarklet
  | 'manual_entry';     // a human typed it in and vouched for it

/** Sources that may carry a price onto the screen. */
export const PRICED_SOURCES: OfferSource[] = [
  'retailer_api',
  'structured_data',
  'browser_capture',
  'manual_entry'
];

export interface Offer {
  id: string;
  /** Join key from buildProductKey(): gtin -> mpn -> brand+model -> title. */
  productKey: string;
  merchant: string;
  /** Exact merchant product URL. Never a search page. Never empty. */
  url: string;
  price: number | null;
  shippingCost: number | null;
  currency: string;
  inStock: boolean | null;
  /** ISO 8601. What "as of" is rendered from. Never optional. */
  observedAt: string;
  source: OfferSource;
  /** Free text describing the specific evidence, e.g. "JSON-LD offers[0].price". */
  sourceDetail?: string;
  /** Merchant's own product id, when the source gave us one. */
  merchantSku?: string;
  /** Identifiers the source asserted, used to re-check the join later. */
  gtin?: string;
  mpn?: string;
}

export interface SearchLink {
  merchant: string;
  url: string;
  /** The exact terms the URL searches for, so a test can assert them. */
  queryTerms: string;
}

/** How stale an offer may be before its price stops being shown as current. */
export const OFFER_PRICE_TTL_HOURS = 24;

/** How stale an offer may be before it is dropped from display entirely. */
export const OFFER_MAX_AGE_DAYS = 30;

function hoursSince(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (isNaN(t)) return Infinity;
  return (now - t) / 36e5;
}

/**
 * Structural validity. An offer with no URL, no source or no timestamp is not
 * an offer -- it is a guess wearing an offer's clothes, and it must never reach
 * the screen. A priced offer additionally needs a finite, positive price.
 */
export function isWellFormedOffer(offer: Partial<Offer> | null | undefined): offer is Offer {
  if (!offer) return false;
  if (typeof offer.url !== 'string' || offer.url.trim().length === 0) return false;
  if (!/^https?:\/\//i.test(offer.url)) return false;
  if (typeof offer.merchant !== 'string' || offer.merchant.trim().length === 0) return false;
  if (typeof offer.productKey !== 'string' || offer.productKey.trim().length === 0) return false;
  if (typeof offer.observedAt !== 'string' || isNaN(Date.parse(offer.observedAt))) return false;
  if (!offer.source || !PRICED_SOURCES.includes(offer.source)) return false;
  if (offer.price !== null && offer.price !== undefined) {
    if (typeof offer.price !== 'number' || !isFinite(offer.price) || offer.price <= 0) return false;
  }
  return true;
}

/**
 * Whether this offer's PRICE may be rendered as a current price.
 * A well-formed offer whose price has gone stale still shows its link and its
 * last-seen price, but labelled with its age -- never as "now".
 */
export function isPriceCurrent(offer: Offer, now: number = Date.now()): boolean {
  if (offer.price === null) return false;
  return hoursSince(offer.observedAt, now) <= OFFER_PRICE_TTL_HOURS;
}

/** Whether the offer is too old to show at all. */
export function isExpired(offer: Offer, now: number = Date.now()): boolean {
  return hoursSince(offer.observedAt, now) > OFFER_MAX_AGE_DAYS * 24;
}

/**
 * The "as of" string rendered next to every price. There is no code path that
 * renders a price without one, which is the point.
 */
export function formatObservedAt(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return 'time unknown';
  const mins = Math.floor((now - t) / 6e4);
  if (mins < 0) return 'just now';
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/**
 * Pick the best offer for a product: lowest landed cost (price + shipping)
 * among non-expired, priced offers. Unpriced offers never win and are never
 * substituted with MSRP.
 */
export function bestOffer(offers: Offer[], now: number = Date.now()): Offer | null {
  const priced = (offers || [])
    .filter(o => isWellFormedOffer(o) && !isExpired(o, now) && o.price !== null);
  if (priced.length === 0) return null;
  return priced.reduce((best, o) => {
    const landed = (o.price as number) + (o.shippingCost ?? 0);
    const bestLanded = (best.price as number) + (best.shippingCost ?? 0);
    return landed < bestLanded ? o : best;
  });
}

/**
 * Deterministic offer id. Same merchant + same URL + same observation time is
 * the same offer, so replaying a capture cannot create duplicates.
 */
export function offerId(merchant: string, url: string, observedAt: string): string {
  const basis = `${merchant}|${url}|${observedAt}`;
  let h = 5381;
  for (let i = 0; i < basis.length; i++) {
    h = ((h << 5) + h + basis.charCodeAt(i)) >>> 0;
  }
  return `of-${h.toString(36)}`;
}
