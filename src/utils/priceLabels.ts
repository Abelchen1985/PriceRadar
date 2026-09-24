/**
 * One place that decides how a "lowest price" is allowed to be described.
 *
 * The rule: a number may be called an all-time low, attributed to a store, or
 * given a date ONLY if this app recorded it. Everything else is an estimate and
 * has to say so. Routing every label through here is what stops the two from
 * drifting apart again -- previously each component wrote its own string, and
 * every one of them asserted "Recorded at <store> on <date>" for numbers that
 * were really MSRP times a discount percentage.
 */

import { TrackedItem } from '../types';

export interface LowPriceLabel {
  /** Heading, e.g. "All-Time Low" or "Typical sale price". */
  label: string;
  value: number;
  /** Sub-line. Store and date only when they are real. */
  detail: string;
  /** Short caveat, empty when the figure is observed. */
  caveat: string;
  isObserved: boolean;
  /** Safe to link to the store? Only when the store attribution is real. */
  canLinkStore: boolean;
}

export function describeLowPrice(item: Pick<TrackedItem,
  'allTimeLow' | 'allTimeLowStore' | 'allTimeLowDate' | 'allTimeLowIsObserved'>): LowPriceLabel {
  const observed = item.allTimeLowIsObserved === true;

  if (observed) {
    return {
      label: 'All-Time Low',
      value: item.allTimeLow,
      detail: `${item.allTimeLowStore} • ${item.allTimeLowDate}`,
      caveat: '',
      isObserved: true,
      canLinkStore: true
    };
  }

  return {
    label: 'Typical sale price',
    value: item.allTimeLow,
    detail: 'Estimate — no price recorded yet',
    caveat: 'Not an observed price. Shown as a starting point for your target.',
    isObserved: false,
    canLinkStore: false
  };
}

/** Whether the app may claim an item is currently AT its all-time low. */
export function canClaimAtAllTimeLow(item: Pick<TrackedItem, 'allTimeLowIsObserved'>): boolean {
  return item.allTimeLowIsObserved === true;
}
