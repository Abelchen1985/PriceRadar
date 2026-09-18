import React, { useState } from 'react';
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
import { TrackedItem, DealOptimizationResult } from '../types';
import { getRetailerDealUrl, getRetailerLinkDetails, isRetailerSellingProduct } from '../utils/retailerUrls';

interface BestDealOptimizerModalProps {
  items: TrackedItem[];
  onClose: () => void;
}

export const BestDealOptimizerModal: React.FC<BestDealOptimizerModalProps> = ({ items, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Compute Best Deal Optimization
  // 1. Single Store Totals (for retailers that carry multiple items)
  const allRetailerNames = Array.from(
    new Set([
      'REI', 'Bass Pro Shops', "Cabela's", 'Tackle Warehouse', 'Backcountry', 'Amazon', 'Walmart', 'Target', 'Best Buy', 'Home Depot', 'B&H Photo', 'Newegg', 'Costco', 'Micro Center',
      ...items.flatMap(it => it.retailers.map(r => r.retailerName))
    ])
  );
  
  const singleStoreTotals: { [key: string]: { total: number; count: number; items: { title: string; price: number }[] } } = {};
  
  allRetailerNames.forEach(store => {
    let sum = 0;
    let count = 0;
    const storeItems: { title: string; price: number }[] = [];

    items.forEach(item => {
      const isSelling = isRetailerSellingProduct(store, item.title, item.brand, item.model);
      const match = isSelling ? item.retailers.find(r => r.retailerName === store && r.inStock) : undefined;
      if (match) {
        sum += match.price;
        count++;
        storeItems.push({ title: item.title, price: match.price });
      }
    });

    if (count > 0) {
      singleStoreTotals[store] = { total: sum, count, items: storeItems };
    }
  });

  // Find best single-store (that has the most items, or closest total)
  const sortedSingleStores = Object.entries(singleStoreTotals)
    .filter(([_, data]) => data.count === items.length)
    .sort((a, b) => a[1].total - b[1].total);

  const bestSingleStore = sortedSingleStores[0] || Object.entries(singleStoreTotals).sort((a, b) => b[1].count - a[1].count || a[1].total - b[1].total)[0];

  // 2. Optimal Multi-Merchant Combo: For every item, pick the retailer with the lowest in-stock price that actually sells it
  const optimalItems = items.map(item => {
    const inStock = item.retailers.filter(r => r.inStock && isRetailerSellingProduct(r.retailerName, item.title, item.brand, item.model));
    const eligibleRetailers = item.retailers.filter(r => isRetailerSellingProduct(r.retailerName, item.title, item.brand, item.model));
    const bestRetailer = inStock.reduce((min, r) => (r.price < min.price ? r : min), inStock[0] || eligibleRetailers[0] || item.retailers[0]);
    return {
      item,
      retailer: bestRetailer,
      price: bestRetailer ? bestRetailer.price : item.msrp,
      storeName: bestRetailer ? bestRetailer.retailerName : 'Unknown',
      shipping: bestRetailer?.shipping || 'Free Shipping',
      url: bestRetailer 
        ? getRetailerDealUrl(bestRetailer.retailerName, item.title, bestRetailer.url, item.brand, item.model) 
        : '#'
    };
  });

  const optimalTotal = optimalItems.reduce((acc, it) => acc + it.price, 0);
  const singleStoreBestCost = bestSingleStore ? bestSingleStore[1].total : items.reduce((acc, it) => acc + it.msrp, 0);
  const totalSavings = Math.max(0, singleStoreBestCost - optimalTotal);
  const savingsPercent = singleStoreBestCost > 0 ? (totalSavings / singleStoreBestCost) * 100 : 0;

  // Group optimal items by retailer
  const groupedByRetailer: { [store: string]: typeof optimalItems } = {};
  optimalItems.forEach(it => {
    if (!groupedByRetailer[it.storeName]) {
      groupedByRetailer[it.storeName] = [];
    }
    groupedByRetailer[it.storeName].push(it);
  });

  const handleCopySummary = () => {
    const text = `🛒 PriceRadar Deal Optimizer Summary:
Total Best Combo: $${optimalTotal.toFixed(2)} across ${Object.keys(groupedByRetailer).length} retailers.
Saved $${totalSavings.toFixed(2)} (${savingsPercent.toFixed(1)}%) vs single-store purchase!

${Object.entries(groupedByRetailer).map(([store, list]) => 
  `• ${store} (${list.length} items - $${list.reduce((sum, i) => sum + i.price, 0).toFixed(2)}):\n` +
  list.map(i => `  - ${i.item.title}: $${i.price.toFixed(2)}`).join('\n')
).join('\n\n')}`;

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

        {/* Savings Big Number Card */}
        <div className="p-6 bg-slate-950/60 border-b border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            
            {/* Optimized Combo Total */}
            <div className="bg-gradient-to-br from-emerald-950/70 to-slate-900 p-4 rounded-xl border border-emerald-500/50 shadow-lg">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Optimized Multi-Store Combo</span>
              </div>
              <div className="text-3xl font-black text-white mt-1">
                ${optimalTotal.toFixed(2)}
              </div>
              <div className="text-xs text-emerald-300 mt-1 font-medium">
                Split across {Object.keys(groupedByRetailer).length} stores for maximum savings
              </div>
            </div>

            {/* Single-Store Comparison */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              <div className="text-xs font-medium text-slate-400">
                Single-Store Best ({bestSingleStore ? bestSingleStore[0] : 'Single Retailer'})
              </div>
              <div className="text-2xl font-bold text-slate-300 mt-1">
                ${singleStoreBestCost.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Cost if buying all items from one merchant
              </div>
            </div>

            {/* Total Savings Breakdown */}
            <div className="bg-blue-950/40 p-4 rounded-xl border border-blue-600/40">
              <div className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                Total Multi-Store Savings
              </div>
              <div className="text-3xl font-black text-emerald-400 mt-1">
                +${totalSavings.toFixed(2)}
              </div>
              <div className="text-xs text-blue-300 font-semibold mt-1">
                You save {savingsPercent.toFixed(1)}% vs buying from a single store!
              </div>
            </div>

          </div>
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
                    {storeItemsList.map(({ item, price, url, shipping }) => (
                      <div key={item.id} className="p-2.5 px-3 flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <img 
                            src={item.imageUrl} 
                            alt={item.title} 
                            className="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">
                              {item.title}
                            </div>
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
            Comparison: What if you bought everything at a single merchant?
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(singleStoreTotals).map(([store, data]) => {
              const diff = data.total - optimalTotal;
              return (
                <div key={store} className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <div className="font-bold text-slate-300">{store}</div>
                  <div className="text-sm font-bold text-white mt-0.5">${data.total.toFixed(2)}</div>
                  <div className="text-[11px] text-rose-400 font-medium mt-0.5">
                    +${diff.toFixed(2)} more expensive
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800/60 border-t border-slate-700 p-4 px-6 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            PCPartPicker algorithmic shopping cart optimizer &bull; Calculated in real-time
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
