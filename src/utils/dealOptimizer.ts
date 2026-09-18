/**
 * Deal Optimizer
 *
 * Decides which store to buy each item from, and whether splitting the order
 * across several stores is actually worth it.
 *
 * WHAT THIS MODEL INCLUDES: item prices and an estimated shipping cost per
 * shipment. Splitting a basket across nine stores means nine deliveries, and an
 * optimizer that compares only item prices will happily recommend a split that
 * loses money once postage is counted. The earlier version did exactly that --
 * it summed prices, ignored the shippingCost field entirely, and reported the
 * difference as savings.
 *
 * WHAT THIS MODEL DELIBERATELY EXCLUDES: sales tax. Tax depends on the buyer's
 * jurisdiction, the seller's nexus and the item category, so any number this app
 * invented would be wrong somewhere. Totals are therefore pre-tax and must be
 * labelled as such wherever they are shown -- see TAX_DISCLOSURE.
 *
 * ON SHIPPING COSTS: retailer free-shipping thresholds are real-world facts that
 * change often and vary by membership, cart contents and address. Rather than
 * hardcode a table of numbers that would quietly rot into fiction, this model
 * takes a single per-shipment estimate the user controls, and reports the
 * break-even so the recommendation can be judged rather than trusted. When real
 * shipping data arrives from a retailer API, it should replace the estimate
 * per store -- the shape here already allows that.
 */

import { TrackedItem, RetailerPrice } from '../types';
import { isRetailerSellingProduct } from './retailerUrls';

export const TAX_DISCLOSURE = 'Totals are pre-tax. Sales tax varies by state and is not included.';

/** Default assumed cost of one shipment, in dollars. User-adjustable. */
export const DEFAULT_SHIPPING_PER_SHIPMENT = 7;

export interface DealPick {
  itemId: string;
  itemTitle: string;
  matchedTitle: string;
  storeName: string;
  price: number;
  retailer: RetailerPrice;
  msrp: number;
}

export interface UnpricedItem {
  itemId: string;
  itemTitle: string;
  reason: string;
}

export interface SingleStoreBaseline {
  storeName: string;
  itemsSubtotal: number;
  shipping: number;
  total: number;
}

export interface StoreCoverage {
  storeName: string;
  itemsCovered: number;
  itemsNeeded: number;
  fullCoverage: boolean;
  subtotal: number;
  /** Only meaningful when fullCoverage is true. */
  totalWithShipping: number | null;
}

export interface DealPlan {
  picks: DealPick[];
  /** Items with no in-stock, priced retailer. Excluded from every total. */
  unpriced: UnpricedItem[];
  byStore: Record<string, DealPick[]>;
  storeCount: number;
  itemsSubtotal: number;
  shippingPerShipment: number;
  estimatedShipping: number;
  /** Pre-tax total for the split plan. */
  splitTotal: number;
  /**
   * Cheapest single store that stocks EVERY priced item, or null when no store
   * covers the whole basket. Comparing a partial basket against a full one --
   * which the previous implementation did whenever no store had full coverage --
   * produces a savings figure that means nothing.
   */
  baseline: SingleStoreBaseline | null;
  baselineNote: string;
  /** Item-price difference only, before shipping. */
  itemPriceSavings: number;
  /** What the split actually saves once extra shipments are paid for. Can be negative. */
  netSavings: number;
  netSavingsPercent: number;
  /** Extra deliveries the split costs versus buying from one store. */
  extraShipments: number;
  /** Per-shipment cost at which the split stops being worth it. */
  breakEvenShipping: number | null;
  verdict: 'split_wins' | 'single_store_wins' | 'split_required' | 'no_data';
  /**
   * Per-store coverage of the basket. A store carrying 3 of 13 items has a
   * small total for an obvious reason, and presenting that total next to the
   * full-basket total (as the previous UI did) invites a nonsense comparison.
   */
  storeCoverage: StoreCoverage[];
}

function pricedInStockOffers(item: TrackedItem): RetailerPrice[] {
  return (item.retailers || []).filter(
    (r) =>
      typeof r.price === 'number' &&
      (r.price as number) > 0 &&
      r.inStock &&
      isRetailerSellingProduct(r.retailerName, item.title, item.brand, item.model)
  );
}

function cheapest(offers: RetailerPrice[]): RetailerPrice | undefined {
  if (offers.length === 0) return undefined;
  return offers.reduce((min, r) => ((r.price as number) < (min.price as number) ? r : min));
}

export interface DealPlanOptions {
  shippingPerShipment?: number;
}

export function computeDealPlan(items: TrackedItem[], options: DealPlanOptions = {}): DealPlan {
  const shippingPerShipment = Math.max(0, options.shippingPerShipment ?? DEFAULT_SHIPPING_PER_SHIPMENT);
  const picks: DealPick[] = [];
  const unpriced: UnpricedItem[] = [];

  for (const item of items || []) {
    const offers = pricedInStockOffers(item);
    const best = cheapest(offers);
    if (!best) {
      // No substituting MSRP for a missing price: an item nobody is selling at a
      // known price is not a deal, and folding its list price into the total
      // would inflate the basket with a number no store quoted.
      unpriced.push({
        itemId: item.id,
        itemTitle: item.title,
        reason: (item.retailers || []).length === 0
          ? 'No retailers tracked for this item yet'
          : 'No in-stock retailer with a verified price'
      });
      continue;
    }
    picks.push({
      itemId: item.id,
      itemTitle: item.title,
      matchedTitle: best.title || item.title,
      storeName: best.retailerName,
      price: best.price as number,
      retailer: best,
      msrp: item.msrp
    });
  }

  const byStore: Record<string, DealPick[]> = {};
  for (const pick of picks) {
    (byStore[pick.storeName] = byStore[pick.storeName] || []).push(pick);
  }

  const storeCount = Object.keys(byStore).length;
  const itemsSubtotal = Number(picks.reduce((sum, p) => sum + p.price, 0).toFixed(2));
  const estimatedShipping = Number((shippingPerShipment * storeCount).toFixed(2));
  const splitTotal = Number((itemsSubtotal + estimatedShipping).toFixed(2));

  // Baseline: only a store that stocks every priced item is a like-for-like
  // comparison.
  const pickedItemIds = new Set(picks.map((p) => p.itemId));
  const itemsNeeded = (items || []).filter((i) => pickedItemIds.has(i.id));
  const candidateStores = Array.from(new Set(picks.map((p) => p.storeName).concat(
    itemsNeeded.flatMap((i) => pricedInStockOffers(i).map((r) => r.retailerName))
  )));

  let baseline: SingleStoreBaseline | null = null;
  const storeCoverage: StoreCoverage[] = [];
  for (const store of candidateStores) {
    let total = 0;
    let covered = 0;
    for (const item of itemsNeeded) {
      const offer = pricedInStockOffers(item).find((r) => r.retailerName === store);
      if (!offer) continue;
      total += offer.price as number;
      covered++;
    }
    const full = covered === itemsNeeded.length && itemsNeeded.length > 0;
    const withShipping = Number((total + shippingPerShipment).toFixed(2));
    storeCoverage.push({
      storeName: store,
      itemsCovered: covered,
      itemsNeeded: itemsNeeded.length,
      fullCoverage: full,
      subtotal: Number(total.toFixed(2)),
      totalWithShipping: full ? withShipping : null
    });
    if (!full) continue;
    if (!baseline || withShipping < baseline.total) {
      baseline = {
        storeName: store,
        itemsSubtotal: Number(total.toFixed(2)),
        shipping: shippingPerShipment,
        total: withShipping
      };
    }
  }

  const extraShipments = Math.max(0, storeCount - 1);
  let itemPriceSavings = 0;
  let netSavings = 0;
  let breakEvenShipping: number | null = null;
  let verdict: DealPlan['verdict'] = 'no_data';
  let baselineNote = '';

  if (picks.length === 0) {
    verdict = 'no_data';
    baselineNote = 'No item has an in-stock retailer price, so there is nothing to compare.';
  } else if (!baseline) {
    verdict = 'split_required';
    baselineNote = `No single store stocks all ${itemsNeeded.length} items, so a split is required. There is no single-store total to compare against.`;
  } else {
    itemPriceSavings = Number((baseline.itemsSubtotal - itemsSubtotal).toFixed(2));
    netSavings = Number((baseline.total - splitTotal).toFixed(2));
    breakEvenShipping = extraShipments > 0 ? Number((itemPriceSavings / extraShipments).toFixed(2)) : null;
    verdict = netSavings > 0 ? 'split_wins' : 'single_store_wins';
    baselineNote = `Cheapest store stocking all ${itemsNeeded.length} items: ${baseline.storeName}.`;
  }

  const netSavingsPercent = baseline && baseline.total > 0
    ? Number(((netSavings / baseline.total) * 100).toFixed(1))
    : 0;

  return {
    picks,
    unpriced,
    byStore,
    storeCount,
    itemsSubtotal,
    shippingPerShipment,
    estimatedShipping,
    splitTotal,
    baseline,
    baselineNote,
    itemPriceSavings,
    netSavings,
    netSavingsPercent,
    extraShipments,
    breakEvenShipping,
    verdict,
    storeCoverage: storeCoverage.sort((a, b) =>
      (b.fullCoverage ? 1 : 0) - (a.fullCoverage ? 1 : 0) || b.itemsCovered - a.itemsCovered || a.subtotal - b.subtotal
    )
  };
}
