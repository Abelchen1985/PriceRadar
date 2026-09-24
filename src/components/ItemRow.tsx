import React, { useState } from 'react';
import { 
  TrendingDown, 
  ExternalLink, 
  Bell, 
  BellOff, 
  History, 
  Store, 
  Trash2, 
  Flame, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Send,
  Mail,
  Check
} from 'lucide-react';
import { TrackedItem, RetailerPrice, EmailRecipient } from '../types';
import { getRetailerDealUrl, getRetailerLinkDetails, isRetailerSellingProduct } from '../utils/retailerUrls';

interface ItemRowProps {
  item: TrackedItem;
  recipients?: EmailRecipient[];
  onCompareStores: (item: TrackedItem) => void;
  onViewHistory: (item: TrackedItem) => void;
  onToggleAlert: (itemId: string, enabled: boolean) => void;
  onUpdateTargetPrice: (itemId: string, newTarget: number) => void;
  onUpdateItemAlertEmails?: (itemId: string, emails: string[]) => void;
  onScrapeItem: (item: TrackedItem) => void;
  onSendTestAlert: (item: TrackedItem) => void;
  onRemoveItem: (itemId: string) => void;
  isScraping?: boolean;
}

export const ItemRow: React.FC<ItemRowProps> = ({
  item,
  recipients = [],
  onCompareStores,
  onViewHistory,
  onToggleAlert,
  onUpdateTargetPrice,
  onUpdateItemAlertEmails,
  onScrapeItem,
  onSendTestAlert,
  onRemoveItem,
  isScraping = false,
}) => {
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(item.targetPrice.toString());
  const [showEmailPicker, setShowEmailPicker] = useState(false);

  // Filter to genuine retailers that actually carry and sell this product
  const displayRetailers: RetailerPrice[] = item.retailers.filter(r =>
    isRetailerSellingProduct(r.retailerName, item.title, item.brand, item.model)
  );

  // Find lowest price among retailers
  const availableRetailers = displayRetailers.filter(r => r.inStock && typeof r.price === 'number' && r.price > 0);
  let lowestRetailer: RetailerPrice | null = null;
  for (const r of availableRetailers) {
    if (!lowestRetailer || (typeof r.price === 'number' && typeof lowestRetailer.price === 'number' && r.price < lowestRetailer.price)) {
      lowestRetailer = r;
    }
  }
  if (!lowestRetailer && displayRetailers.length > 0) {
    lowestRetailer = displayRetailers.find(r => typeof r.price === 'number' && r.price > 0) || displayRetailers[0];
  }

  const currentPrice = lowestRetailer && typeof lowestRetailer.price === 'number' ? lowestRetailer.price : item.msrp;
  // True only when some retailer actually has an observed price. Without this the
  // card fell back to MSRP and still announced "Best on <first store>", which
  // presents a list price nobody quoted as though it were that store's offer.
  const hasObservedPrice = displayRetailers.some(r => typeof r.price === 'number' && r.price > 0);
  const savedVsMsrp = Math.max(0, item.msrp - currentPrice);
  const percentSaved = item.msrp > 0 ? (savedVsMsrp / item.msrp) * 100 : 0;
  const isAllTimeLow = currentPrice <= item.allTimeLow;
  const isNearAllTimeLow = !isAllTimeLow && currentPrice <= item.allTimeLow * 1.05;
  const isBelowTarget = currentPrice <= item.targetPrice;

  const handleSaveTarget = () => {
    const num = parseFloat(targetInput);
    if (!isNaN(num) && num > 0) {
      onUpdateTargetPrice(item.id, num);
    }
    setEditingTarget(false);
  };

  return (
    <div 
      id={`tracked-item-${item.id}`}
      className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/90 rounded-2xl p-4 sm:p-5 transition shadow-sm hover:shadow-md space-y-4"
    >
      {/* Upper Tier: Product Identity & Core Pricing (Side-by-Side on Desktop, Stacked on Mobile) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Left: Product Thumbnail & Detailed Identity */}
        <div className="flex items-start space-x-4 min-w-0 flex-1">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700/60 shadow-inner">
            <img 
              src={item.imageUrl} 
              alt={item.title} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <span className="absolute bottom-1 right-1 text-[10px] font-bold px-1.5 py-0.5 bg-black/85 text-slate-200 rounded tracking-tight backdrop-blur-xs">
              {item.category}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {/* Meta Tags & Deal Badges */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 whitespace-nowrap">
                {item.brand}
              </span>
              <span className="text-xs text-slate-400 font-mono px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800/80 whitespace-nowrap">
                {item.model}
              </span>

              {/* Status Badges with whitespace-nowrap so they never awkwardly wrap */}
              {isAllTimeLow ? (
                <span className="inline-flex items-center space-x-1.5 text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500 shadow-sm shadow-emerald-950 ring-1 ring-emerald-500/40 whitespace-nowrap">
                  <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse fill-emerald-400" />
                  <span>ALL-TIME LOWEST IN HISTORY!</span>
                </span>
              ) : isNearAllTimeLow ? (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-950/60 text-blue-300 border border-blue-600/40 whitespace-nowrap">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>Within 5% of Record Low</span>
                </span>
              ) : percentSaved > 10 ? (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-950/60 text-blue-300 border border-blue-600/40 whitespace-nowrap">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>-{percentSaved.toFixed(0)}% from MSRP</span>
                </span>
              ) : null}

              {isBelowTarget && (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950/70 text-indigo-300 border border-indigo-600/50 whitespace-nowrap">
                  <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                  <span>Target Met (${item.targetPrice.toFixed(0)})</span>
                </span>
              )}
            </div>

            {/* Product Title */}
            <h3 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2 hover:line-clamp-none transition-all">
              {item.title}
            </h3>
            {lowestRetailer?.title && lowestRetailer.title !== item.title && (
              <div className="text-xs text-slate-400 mt-0.5 line-clamp-1" title={`Matched at ${lowestRetailer.retailerName}: ${lowestRetailer.title}`}>
                Matched at {lowestRetailer.retailerName}: <span className="text-slate-300 font-medium">{lowestRetailer.title}</span>
              </div>
            )}

            {/* Historical comparison footer */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
              <div>
                MSRP: <span className="text-slate-300 line-through">${item.msrp.toFixed(2)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>All-Time Low:</span>
                <span className="font-semibold text-emerald-400">${item.allTimeLow.toFixed(2)}</span>
                <a
                  href={getRetailerDealUrl(item.allTimeLowStore, item.title, undefined, item.brand, item.model)}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  referrerPolicy="no-referrer"
                  title={`Open record low storefront: ${item.allTimeLowStore}`}
                  className="text-slate-400 hover:text-emerald-300 text-[11px] underline decoration-slate-600 hover:decoration-emerald-400 transition ml-0.5"
                >
                  ({item.allTimeLowStore}, {item.allTimeLowDate})
                </a>
              </div>
              <div className="text-slate-500 text-[11px]">
                Updated {item.lastUpdated}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Key Price Metrics (Total Saved vs MSRP + Current Best Price) */}
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
          {/* Relocated Total Saved vs MSRP on Each Product */}
          <div 
            id={`savings-card-${item.id}`}
            className={`px-4 py-2.5 rounded-xl border flex flex-col justify-center min-w-[170px] sm:min-w-[190px] transition ${
              isAllTimeLow 
                ? 'bg-gradient-to-br from-emerald-950 via-emerald-900/60 to-slate-900 border-emerald-500 shadow-md shadow-emerald-950/60 ring-2 ring-emerald-500/50' 
                : isNearAllTimeLow
                  ? 'bg-blue-950/70 border-blue-500/60 text-blue-200'
                  : savedVsMsrp > 0
                    ? 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                    : 'bg-slate-900/50 border-slate-800 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5 mb-0.5">
              <span className={`text-[10px] uppercase font-black tracking-wider ${
                isAllTimeLow ? 'text-emerald-300' : 'text-slate-400'
              }`}>
                Total Saved vs MSRP
              </span>
              {isAllTimeLow ? (
                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-emerald-400 text-slate-950 rounded text-[9px] font-black uppercase tracking-tight shadow-sm">
                  <Flame className="w-2.5 h-2.5 fill-slate-950" />
                  <span>Lowest Price</span>
                </span>
              ) : isNearAllTimeLow ? (
                <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-400 border border-blue-500/40 rounded text-[9px] font-bold">
                  Near Low
                </span>
              ) : null}
            </div>

            <div className="flex items-baseline space-x-1.5">
              <span className={`text-lg sm:text-xl font-black tracking-tight ${
                isAllTimeLow 
                  ? 'text-emerald-300' 
                  : savedVsMsrp > 0 
                    ? 'text-blue-400' 
                    : 'text-slate-500'
              }`}>
                {savedVsMsrp > 0 ? `-$${savedVsMsrp.toFixed(2)}` : '$0.00'}
              </span>
              {savedVsMsrp > 0 && (
                <span className={`text-xs font-bold ${
                  isAllTimeLow ? 'text-emerald-400 font-extrabold' : 'text-slate-400'
                }`}>
                  ({percentSaved.toFixed(0)}% off)
                </span>
              )}
            </div>

            {isAllTimeLow ? (
              <div className="text-[10px] text-emerald-300 font-bold flex items-center space-x-1 mt-0.5">
                <span>⚡ Lowest price in history!</span>
              </div>
            ) : isNearAllTimeLow ? (
              <div className="text-[10px] text-blue-300 font-medium mt-0.5">
                Within 5% of record low
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 mt-0.5">
                MSRP: ${item.msrp.toFixed(2)}
              </div>
            )}
          </div>

          {/* Current Best Price Display */}
          <div className="text-right min-w-[130px] sm:min-w-[150px] shrink-0 bg-slate-950/60 p-2.5 px-3.5 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">
              {hasObservedPrice
                ? <>Best on <span className="text-slate-100 font-bold">{lowestRetailer?.retailerName || 'Retailer'}</span></>
                : <span className="text-slate-300 font-bold">No price recorded yet</span>}
            </div>
            <div className={`text-2xl sm:text-3xl font-black tracking-tight ${
              !hasObservedPrice ? 'text-slate-400' : isAllTimeLow ? 'text-emerald-400' : 'text-white'
            }`}>
              ${currentPrice.toFixed(2)}
              {!hasObservedPrice && (
                <span className="block text-[10px] font-semibold text-slate-500 tracking-normal">
                  MSRP shown &mdash; no store price observed
                </span>
              )}
            </div>
            {isAllTimeLow ? (
              <span className="inline-block text-[10px] font-bold text-emerald-400 bg-emerald-950/90 border border-emerald-500/50 px-1.5 py-0.5 rounded">
                All-Time Low (${item.allTimeLow.toFixed(0)})
              </span>
            ) : (
              <div className="text-[10px] text-slate-400">
                Record Low: ${item.allTimeLow.toFixed(2)}
                {item.allTimeLowStore && (
                  <span className="text-slate-400 block text-[9px] truncate max-w-[130px]" title={`Historic low at ${item.allTimeLowStore} (${item.allTimeLowDate})`}>
                    at {item.allTimeLowStore}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Lower Tier: Store Deals & Verified Product Links */}
      <div className="pt-3.5 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Left: Multi-Retailer Deal Strip with Direct vs Search Badges */}
        <div className="flex items-center flex-wrap gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-400 flex items-center space-x-1 mr-1 shrink-0">
            <Store className="w-3.5 h-3.5 text-blue-400" />
            <span>Store Deals:</span>
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            {displayRetailers.map((retailer) => {
              const isBest = lowestRetailer && retailer.id === lowestRetailer.id;
              const cardTitle = retailer.title || item.title;
              const linkDetails = getRetailerLinkDetails(
                retailer.retailerName,
                cardTitle,
                retailer.url,
                item.brand,
                item.model
              );
              const priceLabel = typeof retailer.price === 'number' 
                ? `$${retailer.price.toFixed(0)}` 
                : 'Check';
              const priceDetail = typeof retailer.price === 'number' 
                ? `$${retailer.price.toFixed(2)}` 
                : 'Catalog Check';

              return (
                <a
                  key={retailer.id}
                  href={linkDetails.url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  referrerPolicy="no-referrer"
                  title={`${retailer.retailerName}: ${cardTitle} • ${priceDetail} (${retailer.stockMessage}) • ${linkDetails.tooltip}`}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center space-x-1.5 transition ${
                    isBest 
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-bold shadow-sm shadow-emerald-900/50 hover:bg-emerald-900/80' 
                      : retailer.inStock 
                        ? 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-slate-500 hover:text-white hover:bg-slate-700/80' 
                        : 'bg-slate-900 border-slate-800 text-slate-600 line-through cursor-not-allowed'
                  }`}
                >
                  <span className="font-semibold">{retailer.retailerName}</span>
                  <span className="font-bold">{priceLabel}</span>
                  {linkDetails.isDirect ? (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                      Direct
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                      Search
                    </span>
                  )}
                  {isBest ? (
                    <span className="text-[10px] text-emerald-400">★</span>
                  ) : (
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  )}
                </a>
              );
            })}
          </div>
        </div>

        {/* Right: Email Alert Settings & Quick Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5 justify-end shrink-0">
          
          {/* Email Alert Trigger Setup */}
          <div className="flex items-center space-x-2 bg-slate-950/80 p-1.5 px-2.5 rounded-xl border border-slate-800">
            <button
              id={`toggle-alert-${item.id}`}
              onClick={() => onToggleAlert(item.id, !item.emailAlertEnabled)}
              title={item.emailAlertEnabled ? 'Alert active. Click to disable.' : 'Click to enable email alert'}
              className={`p-1.5 rounded-lg transition ${
                item.emailAlertEnabled 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.emailAlertEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            </button>

            <div className="text-xs">
              <div className="text-slate-400 text-[10px]">Alert if under:</div>
              {editingTarget ? (
                <div className="flex items-center space-x-1">
                  <span className="text-slate-400">$</span>
                  <input 
                    type="number"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    onBlur={handleSaveTarget}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTarget()}
                    autoFocus
                    className="w-16 px-1 py-0.5 bg-slate-900 border border-blue-500 text-white rounded text-xs font-semibold focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingTarget(true)}
                  className="font-bold text-slate-200 hover:text-blue-400 underline decoration-dotted transition text-xs"
                  title="Click to edit target alert price"
                >
                  ${item.targetPrice.toFixed(2)}
                </button>
              )}
            </div>

            {/* Recipient inboxes indicator & quick switcher */}
            {recipients.length > 0 && (
              <div className="relative">
                {(() => {
                  const rawEmails = item.alertEmails && item.alertEmails.length > 0 
                    ? item.alertEmails 
                    : [item.userEmail || 'alerts@example.com'];
                  const itemEmails = rawEmails.map(e => e.includes('abelchen') ? 'alerts@example.com' : e);
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowEmailPicker(!showEmailPicker)}
                        className="flex items-center space-x-1 px-1.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 hover:text-amber-300 transition"
                        title="Click to configure recipient inboxes for this product"
                      >
                        <Mail className="w-3 h-3 text-amber-400" />
                        <span className="font-mono max-w-[85px] truncate">
                          {itemEmails.length === 1 
                            ? itemEmails[0].split('@')[0] 
                            : `${itemEmails.length} inboxes`}
                        </span>
                      </button>

                      {showEmailPicker && (
                        <div className="absolute top-full right-0 mt-1.5 z-40 w-64 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl space-y-2 animate-in fade-in">
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                            <span className="text-[11px] font-bold text-white">Alert Inboxes</span>
                            <button 
                              onClick={() => setShowEmailPicker(false)}
                              className="text-[10px] text-slate-400 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {recipients.map((rec) => {
                              const isChecked = itemEmails.includes(rec.email);
                              return (
                                <button
                                  key={rec.id}
                                  type="button"
                                  onClick={() => {
                                    if (!onUpdateItemAlertEmails) return;
                                    let updated = isChecked 
                                      ? itemEmails.filter(e => e !== rec.email)
                                      : [...itemEmails, rec.email];
                                    if (updated.length === 0) updated = [rec.email];
                                    onUpdateItemAlertEmails(item.id, updated);
                                  }}
                                  className={`w-full p-1.5 rounded-lg text-left text-[11px] flex items-center justify-between transition ${
                                    isChecked 
                                      ? 'bg-amber-500/20 text-amber-300 font-semibold' 
                                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                  }`}
                                >
                                  <span className="truncate pr-1">{rec.label} ({rec.email.split('@')[0]})</span>
                                  {isChecked && <Check className="w-3 h-3 text-amber-400 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Action Tools */}
          <div className="flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            {/* Compare All Stores Modal Trigger */}
            <button
              id={`compare-stores-${item.id}`}
              onClick={() => onCompareStores(item)}
              title="Compare all storefronts side-by-side"
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <Store className="w-4 h-4 text-blue-400" />
            </button>

            {/* Price History Modal Trigger */}
            <button
              id={`view-history-${item.id}`}
              onClick={() => onViewHistory(item)}
              title="View Price History & All-Time Low Chart"
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <History className="w-4 h-4 text-purple-400" />
            </button>

            {/* Scrape Live Prices */}
            <button
              id={`scrape-live-${item.id}`}
              onClick={() => onScrapeItem(item)}
              disabled={isScraping}
              title="Scrape live prices across stores right now"
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isScraping ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
            </button>

            {/* Send Test Email Alert */}
            <button
              id={`test-alert-${item.id}`}
              onClick={() => onSendTestAlert(item)}
              title={`Simulate & send price drop alert email to ${item.userEmail}`}
              className="p-2 rounded-lg hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition"
            >
              <Send className="w-4 h-4" />
            </button>

            {/* Remove */}
            <button
              id={`remove-item-${item.id}`}
              onClick={() => onRemoveItem(item.id)}
              title="Remove from tracking list"
              className="p-2 rounded-lg hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
