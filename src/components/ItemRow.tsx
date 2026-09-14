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

  // Find lowest price among retailers
  const availableRetailers = item.retailers.filter(r => r.inStock);
  let lowestRetailer: RetailerPrice | null = null;
  for (const r of availableRetailers) {
    if (!lowestRetailer || r.price < lowestRetailer.price) {
      lowestRetailer = r;
    }
  }
  if (!lowestRetailer && item.retailers.length > 0) {
    lowestRetailer = item.retailers[0];
  }

  const currentPrice = lowestRetailer ? lowestRetailer.price : item.msrp;
  const priceDropFromMsrp = item.msrp > 0 ? ((item.msrp - currentPrice) / item.msrp) * 100 : 0;
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
      className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition shadow-sm hover:shadow-md"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Item Core Info */}
        <div className="flex items-start space-x-4 min-w-0 flex-1">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700/60">
            <img 
              src={item.imageUrl} 
              alt={item.title} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <span className="absolute bottom-1 right-1 text-[10px] font-bold px-1.5 py-0.2 bg-black/80 text-white rounded">
              {item.category}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {item.brand}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {item.model}
              </span>

              {/* Status Badges */}
              {isAllTimeLow ? (
                <span className="inline-flex items-center space-x-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/50">
                  <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>ALL-TIME LOWEST IN HISTORY!</span>
                </span>
              ) : isNearAllTimeLow ? (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300 border border-blue-600/40">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>Within 5% of Record Low</span>
                </span>
              ) : priceDropFromMsrp > 10 ? (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-600/40">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>-{priceDropFromMsrp.toFixed(0)}% from MSRP</span>
                </span>
              ) : null}

              {isBelowTarget && (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950/70 text-indigo-300 border border-indigo-600/50">
                  <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                  <span>Target Met (${item.targetPrice.toFixed(0)})</span>
                </span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white line-clamp-1 hover:line-clamp-none transition-all">
              {item.title}
            </h3>

            {/* Historical comparison footer */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-400">
              <div>
                MSRP: <span className="text-slate-300 line-through">${item.msrp.toFixed(2)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>All-Time Low:</span>
                <span className="font-semibold text-emerald-400">${item.allTimeLow.toFixed(2)}</span>
                <span className="text-slate-500 text-[11px]">({item.allTimeLowStore}, {item.allTimeLowDate})</span>
              </div>
              <div className="text-slate-500 text-[11px]">
                Updated {item.lastUpdated}
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Retailer Live Strip & Pricing */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 border-slate-800 pt-3 lg:pt-0">
          
          {/* Storefront Mini-Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {item.retailers.map((retailer) => {
              const isBest = lowestRetailer && retailer.id === lowestRetailer.id;
              return (
                <a
                  key={retailer.id}
                  href={retailer.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${retailer.retailerName}: $${retailer.price.toFixed(2)} (${retailer.stockMessage})`}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center space-x-1 transition ${
                    isBest 
                      ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-300 font-bold shadow-sm shadow-emerald-900/40' 
                      : retailer.inStock 
                        ? 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:border-slate-600 hover:text-white' 
                        : 'bg-slate-900 border-slate-800 text-slate-600 line-through'
                  }`}
                >
                  <span>{retailer.retailerName}</span>
                  <span>${retailer.price.toFixed(0)}</span>
                  {isBest && <span className="text-[10px] text-emerald-400">★</span>}
                </a>
              );
            })}
          </div>

          {/* Current Best Price Display */}
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-400 font-medium">
              Best on <span className="text-slate-200 font-semibold">{lowestRetailer?.retailerName || 'Retailer'}</span>
            </div>
            <div className="text-2xl font-black text-emerald-400 tracking-tight">
              ${currentPrice.toFixed(2)}
            </div>
            {priceDropFromMsrp > 0 && (
              <div className="text-xs text-emerald-500 font-semibold">
                Save ${(item.msrp - currentPrice).toFixed(2)}
              </div>
            )}
          </div>

          {/* Email Alert Trigger Setup */}
          <div className="flex items-center space-x-2 bg-slate-800/60 p-2 rounded-xl border border-slate-700/50">
            <button
              id={`toggle-alert-${item.id}`}
              onClick={() => onToggleAlert(item.id, !item.emailAlertEnabled)}
              title={item.emailAlertEnabled ? 'Alert active. Click to disable.' : 'Click to enable email alert'}
              className={`p-1.5 rounded-lg transition ${
                item.emailAlertEnabled 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                  : 'bg-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.emailAlertEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
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
                    className="w-14 px-1 py-0.5 bg-slate-900 border border-blue-500 text-white rounded text-xs font-semibold focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingTarget(true)}
                  className="font-bold text-slate-200 hover:text-blue-400 underline decoration-dotted transition"
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
                  const itemEmails = item.alertEmails && item.alertEmails.length > 0 
                    ? item.alertEmails 
                    : [item.userEmail || 'abelchen1985@gmail.com'];
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowEmailPicker(!showEmailPicker)}
                        className="flex items-center space-x-1 px-1.5 py-1 rounded bg-slate-900/90 hover:bg-slate-700/80 border border-slate-700 text-[10px] text-slate-300 hover:text-amber-300 transition"
                        title="Click to configure recipient inboxes for this product"
                      >
                        <Mail className="w-3 h-3 text-amber-400" />
                        <span className="font-mono max-w-[80px] truncate">
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
          <div className="flex items-center space-x-1">
            {/* Compare All Stores Modal Trigger */}
            <button
              id={`compare-stores-${item.id}`}
              onClick={() => onCompareStores(item)}
              title="Compare all storefronts side-by-side"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <Store className="w-4 h-4 text-blue-400" />
            </button>

            {/* Price History Modal Trigger */}
            <button
              id={`view-history-${item.id}`}
              onClick={() => onViewHistory(item)}
              title="View Price History & All-Time Low Chart"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <History className="w-4 h-4 text-purple-400" />
            </button>

            {/* Scrape Live Prices */}
            <button
              id={`scrape-live-${item.id}`}
              onClick={() => onScrapeItem(item)}
              disabled={isScraping}
              title="Scrape live prices across stores right now"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isScraping ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
            </button>

            {/* Send Test Email Alert */}
            <button
              id={`test-alert-${item.id}`}
              onClick={() => onSendTestAlert(item)}
              title={`Simulate & send price drop alert email to ${item.userEmail}`}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 transition"
            >
              <Send className="w-4 h-4" />
            </button>

            {/* Remove */}
            <button
              id={`remove-item-${item.id}`}
              onClick={() => onRemoveItem(item.id)}
              title="Remove from tracking list"
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
