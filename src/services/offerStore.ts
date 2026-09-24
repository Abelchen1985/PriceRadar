/**
 * Offer Store
 *
 * Holds the offers this app has actually observed, keyed by product. This is
 * what makes a "Buy" button legitimate: the button exists because a row exists,
 * and the row exists because a source produced it. There is no code path that
 * invents a row.
 *
 * It is also the indirection layer behind the /go/:offerId redirect. Because
 * every outbound click resolves through an id held here, a URL that dies can be
 * corrected in one place instead of in every copy that was ever handed out, and
 * a dead link is detectable rather than silently wasting someone's time.
 *
 * PRIVACY INVARIANT: identical to the observation store. A row describes a
 * PRODUCT AT A MERCHANT. There is no user id, email, session, address, IP or
 * device field, `sanitizeOffer` whitelists fields rather than copying an
 * incoming object, and the redirect logs a count and nothing about who clicked.
 * This file is safe to commit and publish. Do not add a field that identifies
 * a person.
 */

import fs from 'fs';
import path from 'path';
import {
  Offer,
  OfferSource,
  PRICED_SOURCES,
  isWellFormedOffer,
  isExpired,
  offerId,
  bestOffer
} from './offers';
import { recordObservation } from './observationStore';

const hasNodeFs = (): boolean => {
  try {
    return typeof process !== 'undefined' && !!process.versions?.node && typeof fs?.existsSync === 'function';
  } catch {
    return false;
  }
};

function dataFile(): string {
  try {
    const dir = process.env.PRICE_DATA_DIR || path.join(process.cwd(), 'data');
    return path.join(dir, 'offers.json');
  } catch {
    return 'data/offers.json';
  }
}

let offers: Offer[] = [];
let clickCounts: Record<string, number> = {};
let loaded = false;
let durable = false;
/**
 * When true the store never touches the filesystem. The self-test suite turns
 * this on: without it, running the tests both read the real offers file (so
 * assertions saw leftover rows) and wrote test fixtures into a user's data
 * directory.
 */
let memoryOnly = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  if (memoryOnly || !hasNodeFs()) {
    durable = false;
    return;
  }
  try {
    const file = dataFile();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(parsed)) offers = parsed.filter(isWellFormedOffer);
    }
    durable = true;
  } catch {
    durable = false;
  }
}

function persist(): void {
  if (memoryOnly || !hasNodeFs()) return;
  try {
    const file = dataFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(offers, null, 2), 'utf-8');
    durable = true;
  } catch {
    durable = false;
  }
}

export function isDurable(): boolean {
  load();
  return durable;
}

/**
 * Whitelist-copy an incoming payload into an Offer. Anything not named here is
 * dropped rather than persisted -- that is the privacy guarantee, and it is why
 * this never spreads an arbitrary object.
 */
export function sanitizeOffer(input: any): Offer | null {
  if (!input || typeof input !== 'object') return null;

  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return null;

  // Strip query strings: they are where tracking ids, session tokens and
  // referral fingerprints live. A canonical product URL does not need them.
  let cleanUrl = url;
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    cleanUrl = u.toString();
  } catch {
    return null;
  }

  const source = input.source as OfferSource;
  if (!PRICED_SOURCES.includes(source)) return null;

  const observedAtRaw = typeof input.observedAt === 'string' ? input.observedAt : new Date().toISOString();
  let observedAt = observedAtRaw;
  const parsed = Date.parse(observedAtRaw);
  if (isNaN(parsed)) {
    observedAt = new Date().toISOString();
  } else if (parsed > Date.now() + 60_000) {
    // A future timestamp is a clock error or a forgery. Clamp it rather than
    // letting it sort to the top of the history forever.
    observedAt = new Date().toISOString();
  }

  // A price that is present but nonsensical (negative, zero, NaN, a string)
  // rejects the whole payload. Quietly nulling it out would store the offer
  // anyway and hide the fact that a source is producing garbage -- exactly the
  // kind of silent degradation that let bad data sit on screen unnoticed.
  const priceRaw = input.price;
  let price: number | null = null;
  if (priceRaw !== null && priceRaw !== undefined) {
    if (typeof priceRaw !== 'number' || !isFinite(priceRaw) || priceRaw <= 0) return null;
    price = priceRaw;
  }

  const shippingRaw = input.shippingCost;
  let shippingCost: number | null = null;
  if (shippingRaw !== null && shippingRaw !== undefined) {
    if (typeof shippingRaw !== 'number' || !isFinite(shippingRaw) || shippingRaw < 0) return null;
    shippingCost = shippingRaw;
  }

  const candidate: Offer = {
    id: typeof input.id === 'string' && input.id ? input.id : offerId(String(input.merchant || ''), cleanUrl, observedAt),
    productKey: typeof input.productKey === 'string' ? input.productKey.trim() : '',
    merchant: typeof input.merchant === 'string' ? input.merchant.trim() : '',
    url: cleanUrl,
    price,
    shippingCost,
    currency: typeof input.currency === 'string' && input.currency ? input.currency : 'USD',
    inStock: typeof input.inStock === 'boolean' ? input.inStock : null,
    observedAt,
    source,
    sourceDetail: typeof input.sourceDetail === 'string' ? input.sourceDetail.slice(0, 200) : undefined,
    merchantSku: typeof input.merchantSku === 'string' ? input.merchantSku.slice(0, 64) : undefined,
    gtin: typeof input.gtin === 'string' ? input.gtin.replace(/[^0-9]/g, '').slice(0, 14) : undefined,
    mpn: typeof input.mpn === 'string' ? input.mpn.slice(0, 64) : undefined
  };

  return isWellFormedOffer(candidate) ? candidate : null;
}

export interface RecordOfferResult {
  stored: boolean;
  reason: string;
  offer?: Offer;
}

/**
 * Record an observed offer. Replaces any prior offer for the same merchant +
 * product, because an offer is a current statement about a listing rather than
 * a historical one -- the history lives in the observation store, which this
 * also feeds so that price charts and all-time lows accrue from real sightings.
 */
export function recordOffer(input: any): RecordOfferResult {
  load();
  const offer = sanitizeOffer(input);
  if (!offer) return { stored: false, reason: 'rejected: malformed or missing url/source/product key' };
  if (!offer.productKey) return { stored: false, reason: 'rejected: no product key' };

  const idx = offers.findIndex(
    o => o.productKey === offer.productKey && o.merchant.toLowerCase() === offer.merchant.toLowerCase()
  );
  if (idx >= 0) {
    // Never let an older sighting overwrite a newer one.
    if (Date.parse(offers[idx].observedAt) > Date.parse(offer.observedAt)) {
      return { stored: false, reason: 'ignored: a newer offer is already on file', offer: offers[idx] };
    }
    offers[idx] = offer;
  } else {
    offers.push(offer);
  }

  if (offer.price !== null) {
    recordObservation({
      productKey: offer.productKey,
      retailer: offer.merchant,
      price: offer.price,
      currency: offer.currency,
      inStock: offer.inStock,
      url: offer.url,
      source: offer.source === 'manual_entry' ? 'manual' : offer.source,
      verified: offer.source === 'retailer_api' || offer.source === 'structured_data',
      observedAt: offer.observedAt
    });
  }

  persist();
  return { stored: true, reason: 'stored', offer };
}

/** All non-expired offers for a product, freshest first. */
export function getOffers(productKey: string, now: number = Date.now()): Offer[] {
  load();
  return offers
    .filter(o => o.productKey === productKey && !isExpired(o, now))
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
}

export function getAllOffers(): Offer[] {
  load();
  return offers.slice();
}

export function getOfferById(id: string): Offer | null {
  load();
  return offers.find(o => o.id === id) || null;
}

/** Best landed-cost offer for a product, or null when nothing was observed. */
export function getBestOffer(productKey: string, now: number = Date.now()): Offer | null {
  return bestOffer(getOffers(productKey, now), now);
}

/**
 * Count a click on an offer. Deliberately just a counter per offer id: there is
 * no visitor, no timestamp trail and no referrer here, because none of that is
 * needed to spot a link that has stopped working.
 */
export function noteClick(id: string): void {
  clickCounts[id] = (clickCounts[id] || 0) + 1;
}

export function getClickCounts(): Record<string, number> {
  return { ...clickCounts };
}

/** Remove an offer whose URL has been proven dead. */
export function retireOffer(id: string): boolean {
  load();
  const before = offers.length;
  offers = offers.filter(o => o.id !== id);
  if (offers.length !== before) {
    persist();
    return true;
  }
  return false;
}

export function __resetForTests(): void {
  offers = [];
  clickCounts = {};
  // Stay "loaded" so nothing is re-read from disk, and never write.
  loaded = true;
  durable = false;
  memoryOnly = true;
}
