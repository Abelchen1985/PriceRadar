/**
 * Structured Data Verification Engine
 *
 * Answers one question about a candidate retailer URL: "does this page actually
 * sell the product we think it does, and at what price?"
 *
 * It does that the way commercial price monitors do -- by reading the
 * schema.org/Product JSON-LD block retailers publish for search engines, rather
 * than scraping rendered HTML. Those blocks carry sku, gtin, mpn, brand and
 * offers.price as structured fields, so a match can be asserted on identifiers
 * instead of on how similar two titles look.
 *
 * TWO RULES GOVERN THIS FILE:
 *
 * 1. Absence of proof is not proof of absence. A 403, a CAPTCHA wall, a timeout
 *    or a robots.txt exclusion tells us NOTHING about whether the link is
 *    correct -- plenty of retailers block automated requests outright. Only
 *    `verified_match`, `mismatch` and `not_found` are marked conclusive, and
 *    only a conclusive negative may ever demote a link. Treating a bot-block as
 *    a broken link would throw away good data.
 *
 * 2. We identify ourselves and respect robots.txt. No spoofed browser user
 *    agent, no fetching paths a site has asked crawlers to leave alone.
 */

import { ProductIdentity } from '../types';

export type LinkVerdict =
  | 'verified_match'     // JSON-LD identifiers confirm this is the requested product
  | 'mismatch'           // a real product page, but for a DIFFERENT product
  | 'no_structured_data' // page loaded, but exposes no usable Product JSON-LD
  | 'not_found'          // 404/410 -- the page is gone
  | 'blocked'            // 403/429/CAPTCHA -- we learned nothing
  | 'disallowed'         // robots.txt asks us not to fetch this path
  | 'unreachable';       // timeout or network error -- we learned nothing

/** Verdicts we are willing to act on. Everything else means "unknown". */
const CONCLUSIVE_VERDICTS: LinkVerdict[] = ['verified_match', 'mismatch', 'not_found'];

export const USER_AGENT =
  'PriceRadarBot/1.0 (+https://github.com/Abelchen1985/PriceRadar; product link verification)';

const FETCH_TIMEOUT_MS = 10000;
const ROBOTS_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 1_500_000;
const ROBOTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface StructuredProduct {
  name?: string;
  sku?: string;
  mpn?: string;
  gtin?: string;
  brand?: string;
  price?: number;
  currency?: string;
  availability?: string;
  productUrl?: string;
}

export interface LinkVerification {
  url: string;
  verdict: LinkVerdict;
  /** True only for verdicts that justify acting on the result. */
  conclusive: boolean;
  checkedAt: string;
  httpStatus?: number;
  product?: StructuredProduct;
  matchedIdentifiers: string[];
  mismatches: string[];
  confidence: number;
  observedPrice?: number | null;
  inStock?: boolean | null;
  notes: string;
}

/* ------------------------------------------------------------------ *
 * JSON-LD extraction (pure, unit-testable)
 * ------------------------------------------------------------------ */

const JSON_LD_BLOCK = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function typeIncludesProduct(node: any): boolean {
  const raw = node && (node['@type'] || node.type);
  return asArray<string>(raw).some(
    (t) => typeof t === 'string' && /^(Product|ProductGroup|IndividualProduct)$/i.test(t.trim())
  );
}

function firstNumber(...candidates: any[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && isFinite(c) && c > 0) return c;
    if (typeof c === 'string') {
      const n = parseFloat(c.replace(/[^0-9.]/g, ''));
      if (isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function extractOffer(node: any): { price?: number; currency?: string; availability?: string; url?: string } {
  for (const offer of asArray<any>(node && node.offers)) {
    if (!offer || typeof offer !== 'object') continue;
    const spec = offer.priceSpecification || {};
    const price = firstNumber(offer.price, offer.lowPrice, spec.price, spec.minPrice);
    if (price === undefined && !offer.availability) continue;
    const availability =
      typeof offer.availability === 'string'
        ? offer.availability.replace(/^https?:\/\/schema\.org\//i, '')
        : undefined;
    return {
      price,
      currency: offer.priceCurrency || spec.priceCurrency,
      availability,
      url: typeof offer.url === 'string' ? offer.url : undefined
    };
  }
  return {};
}

function readBrand(node: any): string | undefined {
  const brand = node && node.brand;
  if (!brand) return undefined;
  if (typeof brand === 'string') return brand;
  const first = asArray<any>(brand)[0];
  if (first && typeof first === 'object' && typeof first.name === 'string') return first.name;
  return undefined;
}

function toProduct(node: any): StructuredProduct {
  const offer = extractOffer(node);
  const gtin = node.gtin13 || node.gtin12 || node.gtin14 || node.gtin8 || node.gtin;
  return {
    name: typeof node.name === 'string' ? node.name.trim() : undefined,
    sku: node.sku !== undefined && node.sku !== null ? String(node.sku).trim() : undefined,
    mpn: node.mpn !== undefined && node.mpn !== null ? String(node.mpn).trim() : undefined,
    gtin: gtin !== undefined && gtin !== null ? String(gtin).trim() : undefined,
    brand: readBrand(node),
    price: offer.price,
    currency: offer.currency,
    availability: offer.availability,
    productUrl: offer.url
  };
}

/**
 * Pulls every schema.org Product out of a page's JSON-LD blocks, walking
 * @graph containers and arrays the way retailers actually nest them.
 */
export function parseJsonLdProducts(html: string): StructuredProduct[] {
  if (!html || typeof html !== 'string') return [];
  const products: StructuredProduct[] = [];
  const seen = new Set<any>();

  const visit = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (typeIncludesProduct(node)) {
      products.push(toProduct(node));
    }
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
      if (node[key]) visit(node[key], depth + 1);
    }
  };

  JSON_LD_BLOCK.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = JSON_LD_BLOCK.exec(html)) !== null) {
    const raw = (block[1] || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\*\s*<!\[CDATA\[\s*\*\//, '')
      .replace(/\/\*\s*\]\]>\s*\*\/\s*$/, '')
      .trim();
    if (!raw) continue;
    try {
      visit(JSON.parse(raw), 0);
    } catch {
      // A malformed block is not a verdict -- skip it and keep looking.
    }
  }

  return products;
}

/* ------------------------------------------------------------------ *
 * Identity comparison (pure, unit-testable)
 * ------------------------------------------------------------------ */

const digits = (s?: string) => (s || '').replace(/[^0-9]/g, '');
const alnum = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface StructuredComparison {
  matchedIdentifiers: string[];
  mismatches: string[];
  confidence: number;
  /** Set when the page proves it sells a different product. */
  contradicted: boolean;
}

/**
 * Compares a page's structured product against the identity we asked for.
 * Identifier conflicts are decisive; title similarity alone never is.
 */
export function compareStructuredProduct(
  identity: ProductIdentity,
  found: StructuredProduct
): StructuredComparison {
  const matchedIdentifiers: string[] = [];
  const mismatches: string[] = [];
  let confidence = 0;
  let contradicted = false;

  const wantGtin = digits(identity.gtin || identity.upc || identity.ean);
  const gotGtin = digits(found.gtin);
  if (wantGtin.length >= 8 && gotGtin.length >= 8) {
    if (wantGtin === gotGtin || wantGtin.endsWith(gotGtin) || gotGtin.endsWith(wantGtin)) {
      matchedIdentifiers.push(`GTIN ${found.gtin}`);
      confidence = 99;
    } else {
      mismatches.push(`GTIN ${found.gtin} != requested ${identity.gtin || identity.upc || identity.ean}`);
      contradicted = true;
    }
  }

  const wantMpn = alnum(identity.mpn);
  const gotMpn = alnum(found.mpn);
  if (wantMpn && gotMpn) {
    if (wantMpn === gotMpn) {
      matchedIdentifiers.push(`MPN ${found.mpn}`);
      confidence = Math.max(confidence, 96);
    } else {
      mismatches.push(`MPN ${found.mpn} != requested ${identity.mpn}`);
      contradicted = true;
    }
  }

  const wantModel = alnum(identity.model);
  const haystack = alnum(`${found.name || ''} ${found.sku || ''} ${found.mpn || ''}`);
  if (wantModel && wantModel.length >= 4 && haystack.includes(wantModel)) {
    matchedIdentifiers.push(`Model ${identity.model}`);
    confidence = Math.max(confidence, 88);
  }

  const wantBrand = (identity.brand || '').trim().toLowerCase();
  const gotBrand = (found.brand || '').trim().toLowerCase();
  const nameLower = (found.name || '').toLowerCase();
  if (wantBrand) {
    if (gotBrand && (gotBrand === wantBrand || gotBrand.includes(wantBrand) || wantBrand.includes(gotBrand))) {
      matchedIdentifiers.push(`Brand ${found.brand}`);
      confidence = Math.max(confidence, matchedIdentifiers.length > 1 ? confidence : 55);
    } else if (nameLower.includes(wantBrand)) {
      matchedIdentifiers.push(`Brand in title (${identity.brand})`);
      confidence = Math.max(confidence, matchedIdentifiers.length > 1 ? confidence : 50);
    } else if (gotBrand) {
      // The page explicitly asserts a brand and it is not ours. That is a
      // positive statement about a different product, so it is decisive.
      mismatches.push(`Brand "${found.brand}" != requested "${identity.brand}"`);
      contradicted = true;
    }
    // Deliberately NOT decisive: a page that declares no brand at all and whose
    // title merely fails to mention ours. That is thin data, not evidence of a
    // different product, and treating it as proof would demote good links.
  }

  return { matchedIdentifiers, mismatches, confidence, contradicted };
}

/* ------------------------------------------------------------------ *
 * robots.txt
 * ------------------------------------------------------------------ */

interface RobotsRules { allow: string[]; disallow: string[]; fetchedAt: number; allowAll: boolean }
const robotsCache = new Map<string, RobotsRules>();

function parseRobots(body: string, agent: string): { allow: string[]; disallow: string[] } {
  const lines = body.split(/\r?\n/);
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current && (field === 'allow' || field === 'disallow')) {
      lastWasAgent = false;
      if (field === 'allow') current.allow.push(value);
      else current.disallow.push(value);
    }
  }

  const token = agent.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const chosen = specific || wildcard;
  return { allow: chosen ? chosen.allow : [], disallow: chosen ? chosen.disallow : [] };
}

function pathMatches(rule: string, path: string): boolean {
  if (!rule) return false;
  const escaped = rule
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  try {
    return new RegExp('^' + escaped).test(path);
  } catch {
    return path.startsWith(rule.replace(/\*/g, ''));
  }
}

/**
 * Standard longest-match evaluation. A site that is unreachable for robots.txt
 * is treated as off limits rather than fair game.
 */
export async function isRobotsAllowed(targetUrl: string, agent: string = USER_AGENT): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  const origin = parsed.origin;
  const cached = robotsCache.get(origin);
  let rules: RobotsRules | undefined =
    cached && Date.now() - cached.fetchedAt < ROBOTS_CACHE_TTL_MS ? cached : undefined;

  if (!rules) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ROBOTS_TIMEOUT_MS);
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': agent, Accept: 'text/plain' },
        signal: controller.signal
      });
      clearTimeout(timer);

      // RFC 9309 s2.3.1: a 4xx means robots.txt is "unavailable" and the crawler
      // may assume no restrictions. 429 and 5xx mean "unreachable" and the
      // crawler must assume it is disallowed until it can check again. Treating
      // every non-200 as a blanket disallow -- as an earlier version did -- makes
      // an unrelated 403 look identical to a site opting out.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        rules = { allow: [], disallow: [], fetchedAt: Date.now(), allowAll: true };
      } else if (!res.ok) {
        rules = { allow: [], disallow: ['/'], fetchedAt: Date.now(), allowAll: false };
      } else {
        const parsedRules = parseRobots(await res.text(), agent);
        rules = { ...parsedRules, fetchedAt: Date.now(), allowAll: false };
      }
    } catch {
      rules = { allow: [], disallow: ['/'], fetchedAt: Date.now(), allowAll: false };
    }
    robotsCache.set(origin, rules);
  }

  if (rules.allowAll) return true;

  const path = parsed.pathname + parsed.search;
  const longest = (list: string[]) =>
    list.filter((r) => pathMatches(r, path)).reduce((best, r) => (r.length > best.length ? r : best), '');

  const bestAllow = longest(rules.allow);
  const bestDisallow = longest(rules.disallow);
  if (!bestDisallow) return true;
  return bestAllow.length >= bestDisallow.length;
}

/* ------------------------------------------------------------------ *
 * Live verification
 * ------------------------------------------------------------------ */

const BOT_WALL_SIGNALS = [
  'captcha',
  'are you a robot',
  'unusual traffic',
  'access denied',
  'request blocked',
  'enable javascript and cookies'
];

function result(url: string, verdict: LinkVerdict, notes: string, extra: Partial<LinkVerification> = {}): LinkVerification {
  return {
    url,
    verdict,
    conclusive: CONCLUSIVE_VERDICTS.includes(verdict),
    checkedAt: new Date().toISOString(),
    matchedIdentifiers: [],
    mismatches: [],
    confidence: 0,
    notes,
    ...extra
  };
}

/**
 * Loads a candidate URL and decides whether it really is the requested product.
 * Never throws: every failure mode comes back as a non-conclusive verdict.
 */
export async function verifyProductUrl(url: string, identity: ProductIdentity): Promise<LinkVerification> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return result(url, 'unreachable', 'Not an absolute http(s) URL');
  }

  if (!(await isRobotsAllowed(url))) {
    return result(url, 'disallowed', 'robots.txt asks automated clients not to fetch this path, so it cannot be checked');
  }

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timer);
    const aborted = err?.name === 'AbortError';
    return result(url, 'unreachable', aborted ? `Timed out after ${FETCH_TIMEOUT_MS}ms` : `Network error: ${err?.message || err}`);
  }
  clearTimeout(timer);

  const status = res.status;
  if (status === 404 || status === 410) {
    return result(url, 'not_found', `Retailer returned ${status}: this page no longer exists`, { httpStatus: status });
  }
  if (status === 403 || status === 429 || status === 401) {
    return result(url, 'blocked', `Retailer returned ${status} (bot protection). The link may still be fine -- we simply cannot check it.`, { httpStatus: status });
  }
  if (!res.ok) {
    return result(url, 'unreachable', `Retailer returned ${status}`, { httpStatus: status });
  }

  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return result(url, 'unreachable', `Response too large to parse (${contentLength} bytes)`, { httpStatus: status });
  }

  let html: string;
  try {
    html = (await res.text()).slice(0, MAX_BODY_BYTES);
  } catch (err: any) {
    return result(url, 'unreachable', `Could not read response body: ${err?.message || err}`, { httpStatus: status });
  }

  const lowered = html.slice(0, 4000).toLowerCase();
  if (BOT_WALL_SIGNALS.some((signal) => lowered.includes(signal))) {
    return result(url, 'blocked', 'Page returned an anti-bot interstitial rather than product content', { httpStatus: status });
  }

  const products = parseJsonLdProducts(html);
  if (products.length === 0) {
    return result(url, 'no_structured_data', 'Page loaded but publishes no schema.org Product data to verify against', { httpStatus: status });
  }

  let best: { product: StructuredProduct; comparison: StructuredComparison } | null = null;
  for (const product of products) {
    const comparison = compareStructuredProduct(identity, product);
    if (!best || comparison.confidence > best.comparison.confidence) {
      best = { product, comparison };
    }
  }
  if (!best) {
    return result(url, 'no_structured_data', 'No comparable product node found', { httpStatus: status });
  }

  const { product, comparison } = best;
  const inStock = product.availability ? /InStock|LimitedAvailability|PreOrder|BackOrder/i.test(product.availability) : null;
  const shared = {
    httpStatus: status,
    product,
    matchedIdentifiers: comparison.matchedIdentifiers,
    mismatches: comparison.mismatches,
    confidence: comparison.confidence,
    observedPrice: product.price ?? null,
    inStock
  };

  if (comparison.confidence >= 88 && !comparison.contradicted) {
    return result(url, 'verified_match', `Confirmed "${product.name || 'product'}" via ${comparison.matchedIdentifiers.join(', ')}`, shared);
  }
  if (comparison.contradicted) {
    return result(url, 'mismatch', `Page sells "${product.name || 'a different product'}" -- ${comparison.mismatches.join('; ')}`, shared);
  }
  return result(url, 'no_structured_data', `Structured data present but insufficient to confirm identity (best confidence ${comparison.confidence})`, shared);
}

/**
 * Verifies many URLs with bounded concurrency, de-duplicating repeats.
 */
export async function verifyProductUrls(
  targets: Array<{ url: string; identity: ProductIdentity }>,
  concurrency = 4
): Promise<LinkVerification[]> {
  const results: LinkVerification[] = [];
  const queue = [...targets];
  const cache = new Map<string, LinkVerification>();

  const worker = async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const cached = cache.get(next.url);
      if (cached) {
        results.push({ ...cached });
        continue;
      }
      const verification = await verifyProductUrl(next.url, next.identity);
      cache.set(next.url, verification);
      results.push(verification);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, targets.length)) }, worker));
  return results;
}
