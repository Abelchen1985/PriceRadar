import React from 'react';
import { 
  X, 
  ExternalLink, 
  Check, 
  Truck, 
  Tag, 
  Flame, 
  Clock, 
  AlertTriangle,
  Star
} from 'lucide-react';
import { TrackedItem } from '../types';
import { getRetailerDealUrl } from '../utils/retailerUrls';

interface RetailerCompareModalProps {
  item: TrackedItem | null;
  onClose: () => void;
  onTriggerAlert: (item: TrackedItem) => void;
}

export const RetailerCompareModal: React.FC<RetailerCompareModalProps> = ({
  item,
  onClose,
  onTriggerAlert,
}) => {
  if (!item) return null;

  // Sort retailers by price ascending (in-stock first)
  const sortedRetailers = [...item.retailers].sort((a, b) => {
    if (a.inStock && !b.inStock) return -1;
    if (!a.inStock && b.inStock) return 1;
    return a.price - b.price;
  });

  const lowestPrice = Math.min(...item.retailers.map(r => r.price));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div 
        id="retailer-compare-dialog"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="bg-slate-800/80 border-b border-slate-700 p-5 sm:p-6 flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <img 
              src={item.imageUrl} 
              alt={item.title} 
              className="w-16 h-16 rounded-xl object-cover border border-slate-700"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                  {item.brand}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {item.model}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-1">
                {item.title}
              </h2>
            </div>
          </div>

          <button 
            id="close-compare-modal"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Historic Low Record Highlight Banner */}
        <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-950/90 border-b border-emerald-800/60 px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-emerald-400 animate-pulse" />
            <span className="text-sm font-bold text-emerald-300">
              All-Time Lowest in History: <span className="text-white text-base">${item.allTimeLow.toFixed(2)}</span>
            </span>
            <span className="text-xs text-slate-400">
              (Recorded at {item.allTimeLowStore} on {item.allTimeLowDate})
            </span>
          </div>

          <div className="text-xs font-semibold text-slate-300">
            Current Best: <span className="text-emerald-400 text-sm font-bold">${lowestPrice.toFixed(2)}</span>
            {lowestPrice <= item.allTimeLow ? (
              <span className="ml-2 px-2 py-0.5 bg-emerald-500 text-black text-[11px] font-black rounded-full uppercase">
                Matching Record Low!
              </span>
            ) : (
              <span className="ml-2 text-slate-400">
                (+${(lowestPrice - item.allTimeLow).toFixed(2)} from record)
              </span>
            )}
          </div>
        </div>

        {/* Storefront Comparison Table / Grid */}
        <div className="p-6">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Simultaneous Storefront Tracking ({sortedRetailers.length} Retailers)</span>
            <span className="text-slate-500 font-normal">Prices verified in real-time</span>
          </div>

          <div className="space-y-3">
            {sortedRetailers.map((retailer, index) => {
              const isBest = retailer.price === lowestPrice && retailer.inStock;
              const diffFromBest = retailer.price - lowestPrice;

              return (
                <div 
                  key={retailer.id}
                  className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isBest 
                      ? 'bg-emerald-950/30 border-emerald-500/70 shadow-sm' 
                      : retailer.inStock 
                        ? 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/80' 
                        : 'bg-slate-900/60 border-slate-800 opacity-60'
                  }`}
                >
                  {/* Retailer Brand & Stock Info */}
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xs text-white uppercase tracking-wider shrink-0">
                      {retailer.retailerName.slice(0, 3)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-base">
                          {retailer.retailerName}
                        </span>
                        {isBest && (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-full">
                            ★ Lowest Price
                          </span>
                        )}
                        {!retailer.inStock && (
                          <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold rounded-full">
                            Out of Stock
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400 mt-1">
                        <span className="flex items-center space-x-1">
                          <Truck className="w-3.5 h-3.5 text-slate-400" />
                          <span>{retailer.shipping}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span>{retailer.rating} ({retailer.reviewCount.toLocaleString()} reviews)</span>
                        </span>
                        <span className={retailer.inStock ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                          {retailer.stockMessage}
                        </span>
                      </div>

                      {retailer.promoCode && (
                        <div className="inline-flex items-center space-x-1 mt-1 text-xs font-semibold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-600/40">
                          <Tag className="w-3 h-3 text-amber-400" />
                          <span>Promo: {retailer.promoCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price & Direct Purchase Action */}
                  <div className="flex items-center justify-between md:justify-end space-x-4 sm:space-x-5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/60">
                    {/* Saved vs MSRP for this retailer */}
                    {item.msrp > retailer.price && (
                      <div className="hidden sm:flex flex-col text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Saved vs MSRP</div>
                        <div className={`text-xs font-bold ${
                          isBest && retailer.price <= item.allTimeLow ? 'text-emerald-300 font-black' : 'text-blue-400'
                        }`}>
                          -${(item.msrp - retailer.price).toFixed(2)} ({(((item.msrp - retailer.price) / item.msrp) * 100).toFixed(0)}% off)
                        </div>
                        {isBest && retailer.price <= item.allTimeLow && (
                          <span className="text-[9px] text-emerald-400 font-bold">★ All-Time Low</span>
                        )}
                      </div>
                    )}

                    <div className="text-left md:text-right">
                      <div className="text-2xl font-black text-white">
                        ${retailer.price.toFixed(2)}
                      </div>
                      <div className="text-xs">
                        {isBest ? (
                          <span className="text-emerald-400 font-semibold">
                            {retailer.price <= item.allTimeLow ? 'Record Low Available' : 'Best Available'}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            +${diffFromBest.toFixed(2)} ({((diffFromBest / lowestPrice) * 100).toFixed(0)}% more)
                          </span>
                        )}
                      </div>
                    </div>

                    <a 
                      href={getRetailerDealUrl(retailer.retailerName, item.title, retailer.url, item.brand, item.model)}
                      target="_blank"
                      rel="noreferrer"
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center space-x-1.5 transition ${
                        isBest
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950'
                          : retailer.inStock
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed pointer-events-none'
                      }`}
                    >
                      <span>Buy at {retailer.retailerName}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-800/60 border-t border-slate-700 p-4 px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Target Alert: <span className="text-slate-200 font-bold">${item.targetPrice.toFixed(2)}</span> &bull; 
            Inboxes: <span className="text-amber-300 font-mono font-medium">
              {item.alertEmails && item.alertEmails.length > 0 ? item.alertEmails.join(', ') : item.userEmail}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => onTriggerAlert(item)}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-amber-300 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Send Test Email Alert</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
