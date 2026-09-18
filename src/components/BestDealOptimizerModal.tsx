import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ShoppingCart, 
  Sparkles, 
  Check, 
  ExternalLink, 
  ArrowRight, 
  PackageCheck, 
  Store,
  Layers,
  Share2,
  Copy
} from 'lucide-react';
import { TrackedItem } from '../types';
import { getRetailerDealUrl, getRetailerLinkDetails } from '../utils/retailerUrls';
import { computeDealPlan, DEFAULT_SHIPPING_PER_SHIPMENT, TAX_DISCLOSURE } from '../utils/dealOptimizer';

interface BestDealOptimizerModalProps {
  items: TrackedItem[];
  onClose: () => void;
}

export const BestDealOptimizerModal: React.FC<BestDealOptimizerModalProps> = ({ items, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Shipping is an explicit, user-controlled assumption rather than a hardcoded
  // per-retailer table: free-shipping thresholds change constantly and depend on
  // membership, cart contents and address, so a baked-in table would quietly
  // become fiction. The break-even figure below lets the recommendation be
  // judged rather than taken on faith.
  const [shippingPerShipment, setShippingPerShipment] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('priceradar_shipping_estimate'));
      if (Number.isFinite(saved) && saved >= 0) return saved;
    } catch {
      // ignore unavailable storage
    }
    return DEFAULT_SHIPPING_PER_SHIPMENT;
  });

  useEffect(() => {
    try {
      localStorage.setItem('priceradar_shipping_estimate', String(shippingPerShipment));
    } catch {
      // ignore unavailable storage
    }
  }, [shippingPerShipment]);

  const plan = useMemo(
    () => computeDealPlan(items, { shippingPerShipment }),
    [items, shippingPerShipment]
  );

  const itemsById = useMemo(() => {
    const map: Record<string, TrackedItem> = {};
    items.forEach(i => { map[i.id] = i; });
    return map;
  }, [items]);

  // Shape the picks for rendering (the render needs the full item + a resolved link)
  const groupedByRetailer = useMemo(() => {
    const grouped: Record<string, Array<{
      item: TrackedItem;
      matchedTitle: string;
      price: number;
      url: string;
      shipping: string;
    }>> = {};
    for (const pick of plan.picks) {
      const item = itemsById[pick.itemId];
      if (!item) continue;
      (grouped[pick.storeName] = grouped[pick.storeName] || []).push({
        item,
        matchedTitle: pick.matchedTitle,
        price: pick.price,
        url: getRetailerDealUrl(pick.storeName, pick.matchedTitle, pick.retailer.url, item.brand, item.model),
        shipping: pick.retailer.shipping || 'Shipping varies'
      });
    }
    return grouped;
  }, [plan, itemsById]);

  const handleCopySummary = () => {
    const savingsLine = plan.baseline
      ? `${plan.netSavings >= 0 ? 'Saves' : 'Costs an extra'} $${Math.abs(plan.netSavings).toFixed(2)} vs buying everything at ${plan.baseline.storeName} ($${plan.baseline.total.toFixed(2)} incl. 1 shipment)`
      : plan.baselineNote;

    const text = `PriceRadar Deal Plan
Items: $${plan.itemsSubtotal.toFixed(2)} across ${plan.storeCount} store(s)
Estimated shipping: $${plan.estimatedShipping.toFixed(2)} (${plan.storeCount} x $${plan.shippingPerShipment.toFixed(2)})
Plan total: $${plan.splitTotal.toFixed(2)}
${savingsLine}
${TAX_DISCLOSURE}

${Object.entries(groupedByRetailer).map(([store, list]) =>
  `- ${store} (${list.length} item(s) - $${list.reduce((sum, i) => sum + i.price, 0).toFixed(2)}):\n` +
  list.map(i => `   * ${i.item.title}: $${i.price.toFixed(2)}`).join('\n')
).join('\n\n')}${plan.unpriced.length > 0 ? `\n\nNot included (no in-stock price found):\n` + plan.unpriced.map(u => `   * ${u.itemTitle}`).join('\n') : ''}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div 
        id="deal-optimizer-dialog"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-emerald-800/60 p-5 sm:p-6 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Cart Optimizer Engine
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {items.length} Tracked Items
                </span>
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-white mt-1">
                Best Deal for Your Item List
              </h2>
            </div>
          </div>

          <button 
            id="close-optimizer-modal"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plan totals */}
        <div className="p-6 bg-slate-950/60 border-b border-slate-800 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">

            {/* Split plan total */}
            <div className="bg-gradient-to-br from-emerald-950/70 to-slate-900 p-4 rounded-xl border border-emerald-500/50 shadow-lg">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Multi-Store Plan Total</span>
              </div>
              <div className="text-3xl font-black text-white mt-1">
                ${plan.splitTotal.toFixed(2)}
              </div>
              <div className="text-xs text-slate-300 mt-1 font-medium">
                ${plan.itemsSubtotal.toFixed(2)} items + ${plan.estimatedShipping.toFixed(2)} shipping
              </div>
              <div className="text-[11px] text-emerald-300/90 mt-0.5">
                {plan.storeCount} store{plan.storeCount === 1 ? '' : 's'} &bull; {plan.storeCount} shipment{plan.storeCount === 1 ? '' : 's'}
              </div>
            </div>

            {/* Single-store baseline */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              <div className="text-xs font-medium text-slate-400">
                {plan.baseline ? `Everything at ${plan.baseline.storeName}` : 'Single-Store Option'}
              </div>
              <div className="text-2xl font-bold text-slate-300 mt-1">
                {plan.baseline ? `$${plan.baseline.total.toFixed(2)}` : 'Not available'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {plan.baseline
                  ? `$${plan.baseline.itemsSubtotal.toFixed(2)} items + $${plan.baseline.shipping.toFixed(2)} shipping`
                  : plan.baselineNote}
              </div>
            </div>

            {/* Verdict */}
            <div className={`p-4 rounded-xl border ${
              plan.verdict === 'split_wins'
                ? 'bg-blue-950/40 border-blue-600/40'
                : plan.verdict === 'single_store_wins'
                  ? 'bg-amber-950/40 border-amber-600/50'
                  : 'bg-slate-900/80 border-slate-700'
            }`}>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {plan.verdict === 'split_wins' && 'Splitting Wins'}
                {plan.verdict === 'single_store_wins' && 'One Store Wins'}
                {plan.verdict === 'split_required' && 'Split Required'}
                {plan.verdict === 'no_data' && 'No Price Data'}
              </div>
              {plan.baseline ? (
                <>
                  <div className={`text-3xl font-black mt-1 ${plan.netSavings >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {plan.netSavings >= 0 ? '+' : '-'}${Math.abs(plan.netSavings).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-300 font-medium mt-1">
                    {plan.netSavings >= 0
                      ? `after paying for ${plan.extraShipments} extra shipment${plan.extraShipments === 1 ? '' : 's'}`
                      : `the extra shipments cost more than the price difference`}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 mt-2">{plan.baselineNote}</div>
              )}
            </div>

          </div>

          {/* Shipping assumption + break-even */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-2.5">
              <label htmlFor="shipping-estimate" className="text-xs font-semibold text-slate-300">
                Assumed shipping per shipment
              </label>
              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2">
                <span className="text-xs text-slate-400">$</span>
                <input
                  id="shipping-estimate"
                  type="number"
                  min={0}
                  step={0.5}
                  value={shippingPerShipment}
                  onChange={(e) => setShippingPerShipment(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 bg-transparent py-1.5 text-xs font-bold text-white focus:outline-none"
                />
              </div>
              <span className="text-[11px] text-slate-500">
                set to 0 if everything ships free for you
              </span>
            </div>

            {plan.breakEvenShipping !== null && plan.baseline && (
              <div className="text-[11px] text-slate-400">
                Item prices alone differ by{' '}
                <span className="font-bold text-slate-200">${plan.itemPriceSavings.toFixed(2)}</span>.
                {' '}Splitting pays off while shipping stays under{' '}
                <span className="font-bold text-emerald-300">${plan.breakEvenShipping.toFixed(2)}</span>
                {' '}per shipment.
              </div>
            )}
          </div>

          {/* Tax disclosure + excluded items */}
          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-semibold text-slate-300">
              Pre-tax
            </span>
            <span>{TAX_DISCLOSURE}</span>
          </div>

          {plan.unpriced.length > 0 && (
            <div className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-800/50 rounded-lg p-2.5">
              <span className="font-bold">
                {plan.unpriced.length} item{plan.unpriced.length === 1 ? '' : 's'} left out of these totals
              </span>
              {' '}&mdash; no in-stock retailer price was found:{' '}
              {plan.unpriced.map(u => u.itemTitle).join(', ')}
            </div>
          )}
        </div>

        {/* Store-by-Store Purchase Plan */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <PackageCheck className="w-4 h-4 text-emerald-400" />
              <span>Optimized Shopping Breakdown by Retailer</span>
            </h3>

            <button
              onClick={handleCopySummary}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 transition flex items-center space-x-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Summary'}</span>
            </button>
          </div>

          <div className="space-y-4">
            {Object.entries(groupedByRetailer).map(([storeName, storeItemsList]) => {
              const subtotal = storeItemsList.reduce((acc, it) => acc + it.price, 0);

              return (
                <div 
                  key={storeName}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden"
                >
                  {/* Retailer Section Header */}
                  <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center font-black text-xs text-white">
                        {storeName.slice(0, 3)}
                      </div>
                      <div>
                        <span className="font-bold text-white text-base">
                          {storeName}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          ({storeItemsList.length} item{storeItemsList.length > 1 ? 's' : ''})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 mr-2">Store Subtotal:</span>
                        <span className="text-base font-black text-emerald-400">${subtotal.toFixed(2)}</span>
                        <div className="text-[10px] text-slate-500">
                          + ${plan.shippingPerShipment.toFixed(2)} est. shipping &bull; pre-tax
                        </div>
                      </div>

                      <a
                        href={getRetailerDealUrl(storeName, storeItemsList[0]?.item.title || storeName)}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        referrerPolicy="no-referrer"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
                      >
                        <span>Open Store</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Items list for this retailer */}
                  <div className="divide-y divide-slate-700/60 p-2">
                    {storeItemsList.map(({ item, matchedTitle, price, url, shipping }) => (
                      <div key={item.id} className="p-2.5 px-3 flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <img 
                            src={item.imageUrl} 
                            alt={item.title} 
                            className="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate" title={matchedTitle || item.title}>
                              {matchedTitle || item.title}
                            </div>
                            {matchedTitle && matchedTitle !== item.title && (
                              <div className="text-[10px] text-slate-400 truncate">
                                Tracked: {item.title}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                              <span>MSRP: ${item.msrp.toFixed(2)}</span>
                              <span>&bull;</span>
                              <span className="text-emerald-400">{shipping}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 shrink-0 pl-3">
                          <div className="text-right">
                            <div className="text-sm font-black text-white">
                              ${price.toFixed(2)}
                            </div>
                            {item.msrp > price && (
                              <div className="text-[10px] text-emerald-400 font-semibold">
                                Save ${(item.msrp - price).toFixed(2)}
                              </div>
                            )}
                          </div>

                          {(() => {
                            const linkDetails = getRetailerLinkDetails(storeName, item.title, url, item.brand, item.model);
                            return (
                              <a
                                href={linkDetails.url}
                                target="_blank"
                                rel="nofollow noopener noreferrer"
                                referrerPolicy="no-referrer"
                                title={linkDetails.tooltip}
                                className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition ${
                                  linkDetails.isDirect 
                                    ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900' 
                                    : 'bg-slate-700/80 border border-slate-600 text-slate-200 hover:bg-slate-700'
                                }`}
                              >
                                <span>{linkDetails.badgeLabel}</span>
                                <ExternalLink className="w-3 h-3 opacity-75" />
                              </a>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })}
          </div>

        </div>

        {/* Single-Store Benchmark Table */}
        <div className="p-6 pt-0">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            What each store would cost on its own
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {plan.storeCoverage.slice(0, 12).map((cov) => {
              // Only a store carrying every item can be compared against the full
              // plan. Showing a 3-of-13 basket next to a 13-item total and calling
              // the difference "savings" is how the old version produced numbers
              // that looked impressive and meant nothing.
              const comparable = cov.fullCoverage && cov.totalWithShipping !== null;
              const diff = comparable ? (cov.totalWithShipping as number) - plan.splitTotal : null;
              return (
                <div key={cov.storeName} className={`p-2.5 rounded-lg border ${
                  comparable ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-950/30 border-slate-800/60'
                }`}>
                  <div className="font-bold text-slate-300">{cov.storeName}</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    ${(comparable ? cov.totalWithShipping as number : cov.subtotal).toFixed(2)}
                  </div>
                  {comparable ? (
                    <div className={`text-[11px] font-medium mt-0.5 ${
                      (diff as number) >= 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {(diff as number) >= 0
                        ? `$${(diff as number).toFixed(2)} more than the plan`
                        : `$${Math.abs(diff as number).toFixed(2)} less than the plan`}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      only {cov.itemsCovered} of {cov.itemsNeeded} items &mdash; not comparable
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800/60 border-t border-slate-700 p-4 px-6 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Totals include estimated shipping &bull; {TAX_DISCLOSURE}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
