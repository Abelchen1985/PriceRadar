/**
 * Price Observation Store
 *
 * An append-only record of prices this app has actually SEEN, with where each
 * one came from and when. Everything else in the codebase derives from this:
 * an all-time low is only true if it was observed and recorded, never if it was
 * computed from MSRP.
 *
 * PRIVACY INVARIANT: an observation describes a PRODUCT AT A RETAILER and
 * nothing else. There is no user id, no email, no session, no address, no IP
 * and no device information in this store, and `sanitizeObservation` below
 * enforces that by whitelisting fields -- anything else on an incoming payload
 * is dropped rather than persisted. The file this writes is safe to commit,
 * publish or hand to anyone. Do not add a field that identifies a person.
 *
 * DURABILITY: the backing file lives at PRICE_DATA_DIR (default ./data). On a
 * host with an ephemeral filesystem -- Render's free tier, for one -- that file
 * does not survive a redeploy. `isDurable()` reports which case you are in so
 * the UI can say "history resets on redeploy" instead of implying a permanent
 * record. Point PRICE_DATA_DIR at a mounted disk, or swap the backend for a
 * database, to make it permanent.
 */

import fs from 'fs';
import path from 'path';
import { ProductIdentity } from '../types';

export type ObservationSource =
  | 'structured_data'  // read from the retailer page's schema.org JSON-LD
  | 'retailer_api'     // returned by an official retailer API
  | 'browser_capture'  // captured from a page the user was viewing
  | 'manual';          // typed in by hand

export interface PriceObservation {
  productKey: string;
  retailer: string;
  price: number;
  currency: string;
  inStock: boolean | null;
  url: string;
  source: ObservationSource;
  /** Whether the product identity was confirmed at capture time. */
  verified: boolean;
  observedAt: string;
}

export interface PricePoint {
  price: number;
  retailer: string;
  observedAt: string;
}

export interface PriceStats {
  productKey: string;
  observationCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  allTimeLow: PricePoint | null;
  currentBest: PricePoint | null;
  byRetailer: Record<string, { latest: PricePoint; low: PricePoint }>;
  /** False when the history is too short to mean anything yet. */
  hasMeaningfulHistory: boolean;
}

/**
 * Resolved lazily and defensively. Reading process.env at module scope meant
 * that merely importing this file in a browser threw "process is not defined"
 * before anything could catch it -- which is precisely what happened when the
 * test suite (which imports this) was bundled into the client. Nothing here
 * touches Node globals until a storage call is actually made, and in an
 * environment without them the store degrades to memory-only.
 */
const hasNodeFs = (): boolean => {
  try {
    return typeof process !== 'undefined' && !!process.versions?.node && typeof fs?.existsSync === 'function';
  } catch {
    return false;
  }
};

function dataDir(): string {
  try {
    return process.env.PRICE_DATA_DIR || path.join(process.cwd(), 'data');
  } catch {
    return 'data';
  }
}

function dataFile(): string {
  try {
    return path.join(dataDir(), 'observations.json');
  } catch {
    return 'data/observations.json';
  }
}

/** Below this many days of data, an "all-time low" is not worth the name. */
export const MEANINGFUL_HISTORY_DAYS = 14;

/** Identical price from the same retailer inside this window is not re-recorded. */
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

let observations: PriceObservation[] = [];
let loaded = false;
let durable = false;

/**
 * A stable, non-personal key for a product: strongest available identifier
 * first. Two callers describing the same item must produce the same key.
 */
export function buildProductKey(identity: Partial<ProductIdentity>): string {
  const clean = (s?: string) => (s || '').toString().trim().toLowerCase();
  const gtin = clean(identity.gtin || identity.upc || identity.ean).replace(/[^0-9]/g, '');
  if (gtin.length >= 8) return `gtin:${gtin}`;

  const mpn = clean(identity.mpn).replace(/[^a-z0-9]/g, '');
  if (mpn.length >= 4) return `mpn:${mpn}`;

  const brand = clean(identity.brand).replace(/[^a-z0-9]/g, '');
  const model = clean(identity.model).replace(/[^a-z0-9]/g, '');
  if (brand && model) return `bm:${brand}-${model}`;

  const title = clean(identity.normalizedTitle || identity.productName)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return title ? `t:${title}` : 'unknown';
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!hasNodeFs()) {
    durable = false;
    return;
  }
  try {
    const file = dataFile();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(parsed)) observations = parsed.filter(Boolean);
    }
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.accessSync(dataDir(), fs.constants.W_OK);
    durable = true;
  } catch {
    // Read-only or unavailable filesystem: keep serving from memory and report
    // that the history is not durable rather than pretending otherwise.
    durable = false;
  }
}

function persist(): void {
  if (!durable || !hasNodeFs()) return;
  try {
    const file = dataFile();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(observations), 'utf-8');
    fs.renameSync(tmp, file);
  } catch {
    durable = false;
  }
}

/** True when observations survive a restart of this process. */
export function isDurable(): boolean {
  load();
  return durable;
}

/**
 * Keeps only the fields an observation is allowed to contain. Anything else on
 * the incoming object -- including anything identifying a person -- is dropped
 * here and never reaches storage.
 */
export function sanitizeObservation(input: any): PriceObservation | null {
  if (!input || typeof input !== 'object') return null;

  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const retailer = String(input.retailer || '').trim();
  const productKey = String(input.productKey || '').trim();
  if (!retailer || !productKey) return null;

  const allowedSources: ObservationSource[] = ['structured_data', 'retailer_api', 'browser_capture', 'manual'];
  const source: ObservationSource = allowedSources.includes(input.source) ? input.source : 'manual';

  let observedAt = new Date().toISOString();
  if (input.observedAt) {
    const parsed = new Date(input.observedAt);
    // Never trust a caller-supplied future timestamp: it would poison "latest".
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      observedAt = parsed.toISOString();
    }
  }

  // Strip query strings: retailer URLs carry session, affiliate and tracking
  // parameters that can identify whoever captured the price.
  let url = '';
  try {
    const parsedUrl = new URL(String(input.url || ''));
    url = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    url = '';
  }

  return {
    productKey,
    retailer,
    price: Number(price.toFixed(2)),
    currency: String(input.currency || 'USD').slice(0, 3).toUpperCase(),
    inStock: typeof input.inStock === 'boolean' ? input.inStock : null,
    url,
    source,
    verified: Boolean(input.verified),
    observedAt
  };
}

export interface RecordResult {
  recorded: boolean;
  reason?: string;
  observation?: PriceObservation;
}

export function recordObservation(input: any): RecordResult {
  load();
  const observation = sanitizeObservation(input);
  if (!observation) {
    return { recorded: false, reason: 'Observation missing a product key, retailer or usable price' };
  }

  const previous = observations
    .filter(o => o.productKey === observation.productKey && o.retailer === observation.retailer)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];

  if (
    previous &&
    previous.price === observation.price &&
    previous.inStock === observation.inStock &&
    Date.parse(observation.observedAt) - Date.parse(previous.observedAt) < DEDUPE_WINDOW_MS
  ) {
    return { recorded: false, reason: 'Identical price already recorded within the last hour', observation: previous };
  }

  observations.push(observation);
  persist();
  return { recorded: true, observation };
}

export function getObservations(productKey?: string): PriceObservation[] {
  load();
  const list = productKey ? observations.filter(o => o.productKey === productKey) : observations.slice();
  return list.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

export function getStats(productKey: string): PriceStats {
  const history = getObservations(productKey);

  const empty: PriceStats = {
    productKey,
    observationCount: 0,
    firstObservedAt: null,
    lastObservedAt: null,
    allTimeLow: null,
    currentBest: null,
    byRetailer: {},
    hasMeaningfulHistory: false
  };
  if (history.length === 0) return empty;

  const toPoint = (o: PriceObservation): PricePoint => ({
    price: o.price,
    retailer: o.retailer,
    observedAt: o.observedAt
  });

  const low = history.reduce((min, o) => (o.price < min.price ? o : min));

  // "Current best" means the cheapest among each retailer's most recent
  // observation -- not the cheapest ever seen, which would be history, not a
  // price anyone can pay today.
  const byRetailer: PriceStats['byRetailer'] = {};
  for (const o of history) {
    const existing = byRetailer[o.retailer];
    if (!existing) {
      byRetailer[o.retailer] = { latest: toPoint(o), low: toPoint(o) };
      continue;
    }
    if (Date.parse(o.observedAt) >= Date.parse(existing.latest.observedAt)) existing.latest = toPoint(o);
    if (o.price < existing.low.price) existing.low = toPoint(o);
  }

  const latests = Object.values(byRetailer).map(r => r.latest);
  const currentBest = latests.reduce((min, p) => (p.price < min.price ? p : min), latests[0]);

  const firstObservedAt = history[0].observedAt;
  const spanDays = (Date.now() - Date.parse(firstObservedAt)) / (1000 * 60 * 60 * 24);

  return {
    productKey,
    observationCount: history.length,
    firstObservedAt,
    lastObservedAt: history[history.length - 1].observedAt,
    allTimeLow: toPoint(low),
    currentBest,
    byRetailer,
    hasMeaningfulHistory: spanDays >= MEANINGFUL_HISTORY_DAYS && history.length >= 5
  };
}

export function getTrackedProductKeys(): string[] {
  load();
  return Array.from(new Set(observations.map(o => o.productKey))).sort();
}

/** Test helper: empties the in-memory store without touching disk. */
export function __resetForTests(): void {
  observations = [];
  loaded = true;
  durable = false;
}
