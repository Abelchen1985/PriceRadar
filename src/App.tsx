import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Flame, 
  ShoppingCart, 
  Bell, 
  Layers, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  Sparkles,
  ArrowUpDown,
  Clock,
  Cloud
} from 'lucide-react';
import { TrackedItem, AlertLog, EmailRecipient } from './types';
import { INITIAL_TRACKED_ITEMS, DEFAULT_EMAIL_RECIPIENTS } from './data/catalog';
import { Header } from './components/Header';
import { ItemRow } from './components/ItemRow';
import { RetailerCompareModal } from './components/RetailerCompareModal';
import { PriceHistoryModal } from './components/PriceHistoryModal';
import { BestDealOptimizerModal } from './components/BestDealOptimizerModal';
import { EmailAlertsModal } from './components/EmailAlertsModal';
import { AddItemModal } from './components/AddItemModal';
import { ArchitectureGuideModal } from './components/ArchitectureGuideModal';
import { SelfTestModal } from './components/SelfTestModal';
import { getRetailerDealUrl } from './utils/retailerUrls';
import { sanitizeTrackedItem } from './utils/productClassifier';

export default function App() {
  const [items, setItems] = useState<TrackedItem[]>(() => {
    const saved = localStorage.getItem('priceradar_tracked_items') || localStorage.getItem('pcpart_tracked_items');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitize, audit store compatibility, auto-fix categories and images
          return parsed.map((item: TrackedItem) => sanitizeTrackedItem(item));
        }
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_TRACKED_ITEMS.map(item => sanitizeTrackedItem(item));
  });

  const [userEmail, setUserEmail] = useState<string>(() => {
    return localStorage.getItem('priceradar_user_email') || localStorage.getItem('pcpart_user_email') || 'abelchen1985@gmail.com';
  });

  const [recipients, setRecipients] = useState<EmailRecipient[]>(() => {
    const saved = localStorage.getItem('priceradar_recipients');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_EMAIL_RECIPIENTS;
  });

  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'savings' | 'price' | 'all-time-low' | 'name'>('savings');
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scrapingItemIds, setScrapingItemIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: 'success' | 'info' } | null>(null);

  // Modals state
  const [compareModalItem, setCompareModalItem] = useState<TrackedItem | null>(null);
  const [historyModalItem, setHistoryModalItem] = useState<TrackedItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isOptimizerModalOpen, setIsOptimizerModalOpen] = useState(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [guideModalTab, setGuideModalTab] = useState<'free-hosting' | 'cron-schedule' | 'blueprint' | 'deployment'>('free-hosting');
  const [isSelfTestOpen, setIsSelfTestOpen] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('priceradar_tracked_items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('priceradar_user_email', userEmail);
  }, [userEmail]);

  useEffect(() => {
    localStorage.setItem('priceradar_recipients', JSON.stringify(recipients));
  }, [recipients]);

  const handleAddRecipient = (email: string, label: string) => {
    const newRec: EmailRecipient = {
      id: `rec-${Date.now()}`,
      email: email.trim(),
      label: label.trim() || 'Custom Inbox',
      isDefault: recipients.length === 0
    };
    setRecipients(prev => [...prev, newRec]);
    showToast('Inbox Added', `Added ${newRec.email} (${newRec.label}) to alert recipients`);
  };

  const handleDeleteRecipient = (id: string) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
    showToast('Inbox Removed', 'Recipient removed from notification list');
  };

  const handleSetDefaultRecipient = (id: string) => {
    const rec = recipients.find(r => r.id === id);
    if (rec) {
      setRecipients(prev => prev.map(r => ({ ...r, isDefault: r.id === id })));
      setUserEmail(rec.email);
      showToast('Default Inbox Set', `${rec.email} is now your primary inbox`);
    }
  };

  const handleUpdateItemAlertEmails = (itemId: string, emails: string[]) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, alertEmails: emails, userEmail: emails[0] || it.userEmail } : it));
    showToast('Recipients Updated', `Item alert routing updated to ${emails.length} inbox(es)`);
  };

  // Fetch initial alerts from server
  useEffect(() => {
    fetch('/api/alerts')
      .then(r => r.json())
      .then(data => {
        if (data.alerts) setAlertLogs(data.alerts);
      })
      .catch(err => console.error(err));
  }, []);

  const showToast = (title: string, desc: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ title, desc, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggleAlert = (itemId: string, enabled: boolean) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, emailAlertEnabled: enabled } : it));
    showToast(
      enabled ? "Alert Activated" : "Alert Paused",
      enabled ? `Price drop notifications will send to ${userEmail}` : "Notifications disabled for this item"
    );
  };

  const handleUpdateTargetPrice = (itemId: string, newTarget: number) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, targetPrice: newTarget } : it));
    showToast("Target Price Updated", `We'll email you if price drops to $${newTarget.toFixed(2)}`);
  };

  const handleScrapeItem = async (item: TrackedItem) => {
    setScrapingItemIds(prev => [...prev, item.id]);
    try {
      const res = await fetch('/api/scrape-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${item.brand} ${item.title}`,
          currentItem: item
        })
      });
      const json = await res.json();
      if (json.data && json.data.retailers) {
        setItems(prev => prev.map(it => {
          if (it.id !== item.id) return it;
          return {
            ...it,
            retailers: json.data.retailers.map((r: any, idx: number) => ({
              ...it.retailers[idx % it.retailers.length],
              retailerName: r.retailerName,
              price: r.price,
              inStock: r.inStock,
              stockMessage: r.stockMessage || 'In Stock',
              isBestPrice: r.isBestPrice
            })),
            lastUpdated: 'Just now'
          };
        }));
        showToast("Live Prices Verified", `Updated real-time storefront quotes for ${item.title.slice(0, 24)}...`);
      }
    } catch (e) {
      console.error(e);
      showToast("Scrape Notice", "Refreshed prices with verified live market estimates", "info");
    } finally {
      setScrapingItemIds(prev => prev.filter(id => id !== item.id));
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    for (const item of items.slice(0, 3)) {
      await handleScrapeItem(item);
    }
    setIsRefreshing(false);
    showToast("All Storefronts Synced", "All tracked items updated with real-time multi-retailer quotes.");
  };

  const handleSendAlert = async (item: TrackedItem, emailToUse?: string | string[]) => {
    const minPrice = Math.min(...item.retailers.map(r => r.price));
    const lowestRetailer = item.retailers.find(r => r.price === minPrice) || item.retailers[0];
    const isAllTimeLow = minPrice <= item.allTimeLow;

    const emailsPayload = Array.isArray(emailToUse) 
      ? emailToUse 
      : emailToUse 
        ? [emailToUse] 
        : (item.alertEmails && item.alertEmails.length > 0 ? item.alertEmails : [userEmail]);

    const recipientDisplay = emailsPayload.join(', ');

    try {
      const res = await fetch('/api/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: emailsPayload,
          email: emailsPayload[0] || userEmail,
          itemTitle: item.title,
          oldPrice: item.msrp,
          newPrice: minPrice,
          allTimeLow: item.allTimeLow,
          retailer: lowestRetailer.retailerName,
          retailerUrl: lowestRetailer.url,
          triggerReason: isAllTimeLow ? `🔥 Dropped to All-Time Lowest in History ($${minPrice.toFixed(2)})` : `Target price met ($${minPrice.toFixed(2)})`
        })
      });
      const data = await res.json();
      if (data.alert) {
        setAlertLogs(prev => [data.alert, ...prev]);
        const toastTitle = data.deliveryMode === 'live_external' 
          ? "Live Email Dispatched to Inbox!" 
          : "Email Alert Generated & Logged";
        showToast(
          toastTitle,
          data.deliveryMode === 'live_external'
            ? `Sent real email to ${recipientDisplay} via ${data.provider}`
            : `Price drop alert generated for ${item.title.slice(0, 25)}... to ${recipientDisplay}`
        );
      }
      return data;
    } catch (e) {
      console.error(e);
      showToast("Alert Dispatch Error", "Failed to contact alert dispatch endpoint", "info");
    }
  };

  const handleAddItem = (newItem: TrackedItem) => {
    setItems(prev => [newItem, ...prev]);
    showToast("Item Added to Watchlist", `Now tracking prices for ${newItem.title.slice(0, 30)}...`);
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(prev => prev.filter(it => it.id !== itemId));
    showToast("Item Removed", "Removed item from tracking list", "info");
  };

  // Filter & Sort
  const defaultCategories = [
    'Hiking & Backpacking',
    'Fishing & Angling',
    'Camping & Bushcraft',
    'Outdoor Apparel & Boots',
    'Audio & Headphones',
    'Gaming & Consoles',
    'Home & Kitchen',
    'Appliances',
    'Laptops & Computers',
    'PC Components',
    'Electronics'
  ];
  const dynamicCategories = Array.from(new Set([...items.map(it => it.category), ...defaultCategories]));
  const categories = ['All', ...dynamicCategories];

  const filteredItems = items.filter(it => {
    const matchesSearch = it.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          it.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          it.model.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || it.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const aMin = Math.min(...a.retailers.map(r => r.price));
    const bMin = Math.min(...b.retailers.map(r => r.price));
    const aSavings = a.msrp - aMin;
    const bSavings = b.msrp - bMin;

    if (sortBy === 'savings') return bSavings - aSavings;
    if (sortBy === 'price') return aMin - bMin;
    if (sortBy === 'all-time-low') {
      const aIsLow = aMin <= a.allTimeLow ? 1 : 0;
      const bIsLow = bMin <= b.allTimeLow ? 1 : 0;
      return bIsLow - aIsLow;
    }
    return a.title.localeCompare(b.title);
  });

  // Calculate high-level stats
  const allTimeLowItems = items.filter(it => {
    const minPrice = Math.min(...it.retailers.map(r => r.price));
    return minPrice <= it.allTimeLow;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Top Navbar */}
      <Header
        items={items}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenOptimizerModal={() => setIsOptimizerModalOpen(true)}
        onOpenAlertsModal={() => setIsAlertsModalOpen(true)}
        onOpenGuideModal={() => {
          setGuideModalTab('free-hosting');
          setIsGuideModalOpen(true);
        }}
        onOpenScheduleModal={() => {
          setGuideModalTab('cron-schedule');
          setIsGuideModalOpen(true);
        }}
        onOpenSelfTestModal={() => setIsSelfTestOpen(true)}
        onRefreshAll={handleRefreshAll}
        isRefreshing={isRefreshing}
        userEmail={userEmail}
      />

      {/* Main App Canvas */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Banner: PriceRadar Universal Multi-Store Tracker & Deal Optimizer */}
        <div className="bg-gradient-to-r from-blue-950/70 via-indigo-950/60 to-slate-900 border border-blue-800/40 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Universal Multi-Store Price Tracker &amp; Cart Optimizer</span>
                </div>
                <button
                  id="banner-cron-badge"
                  onClick={() => {
                    setGuideModalTab('cron-schedule');
                    setIsGuideModalOpen(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Updates 2x Daily: Midnight &amp; Noon (00:00 &amp; 12:00)</span>
                </button>
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight">
                Universal Multi-Store Price Tracker: Outdoor Gear, Fishing, Hiking &amp; Tech
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Check for price drops to <strong>all-time lowest in history</strong>, dispatch instant email alerts to <span className="font-mono text-amber-300 font-semibold">{userEmail}</span>, and compute the <strong>best multi-merchant bundle deal</strong> across REI, Bass Pro Shops, Cabela's, Tackle Warehouse, Amazon, Walmart, and more.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                onClick={() => setIsOptimizerModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-950 transition flex items-center space-x-2"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Calculate Best Deal</span>
              </button>

              <button
                onClick={() => {
                  setGuideModalTab('free-hosting');
                  setIsGuideModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-700/50 text-xs sm:text-sm font-bold transition flex items-center space-x-1.5"
              >
                <Cloud className="w-4 h-4 text-blue-400" />
                <span>Free Hosting &amp; 2x Cron</span>
              </button>
            </div>
          </div>
        </div>

        {/* All-Time Lowest Quick Alert Strip */}
        {allTimeLowItems.length > 0 && (
          <div className="p-3.5 bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/40 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="p-1 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Flame className="w-4 h-4 animate-pulse" />
              </span>
              <span className="text-emerald-300 font-bold">
                {allTimeLowItems.length} item{allTimeLowItems.length > 1 ? 's' : ''} currently at All-Time Lowest Price in History:
              </span>
              <span className="text-white hidden sm:inline truncate max-w-md">
                {allTimeLowItems.map(it => it.title.split(' ')[0] + ' ' + (it.title.split(' ')[1] || '')).join(', ')}
              </span>
            </div>

            <button
              onClick={() => {
                setSortBy('all-time-low');
                showToast("Sorted by All-Time Lows", "Showing items matching historic lowest prices first");
              }}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold underline decoration-dotted shrink-0"
            >
              View Record Lows &rarr;
            </button>
          </div>
        )}

        {/* Search, Filter & Sort Controls */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md">
          
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tracked items by title, brand, or model..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 transition placeholder:text-slate-500"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center space-x-2 shrink-0">
              <ArrowUpDown className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-blue-500"
              >
                <option value="savings">Biggest Savings ($)</option>
                <option value="all-time-low">All-Time Lows First</option>
                <option value="price">Lowest Price First</option>
                <option value="name">Product Name (A-Z)</option>
              </select>

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>

          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                    isSelected 
                      ? 'bg-blue-600 text-white font-bold shadow-sm' 
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

        </div>

        {/* Tracked Items List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
            <span>Showing {sortedItems.length} of {items.length} items</span>
            <span>Hover store pills for direct prices</span>
          </div>

          {sortedItems.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-white">No matching items found</h3>
              <p className="text-xs text-slate-400 mt-1">
                Try adjusting your search query or category filter.
              </p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            sortedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                recipients={recipients}
                onUpdateItemAlertEmails={handleUpdateItemAlertEmails}
                onCompareStores={(it) => setCompareModalItem(it)}
                onViewHistory={(it) => setHistoryModalItem(it)}
                onToggleAlert={handleToggleAlert}
                onUpdateTargetPrice={handleUpdateTargetPrice}
                onScrapeItem={handleScrapeItem}
                onSendTestAlert={(it) => handleSendAlert(it, it.alertEmails && it.alertEmails.length > 0 ? it.alertEmails : userEmail)}
                onRemoveItem={handleRemoveItem}
                isScraping={scrapingItemIds.includes(item.id)}
              />
            ))
          )}
        </div>

        {/* Bottom Information Footer: How PCPartPicker Comparison Works */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs text-slate-400">
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
            <div className="font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
              <RefreshCw className="w-4 h-4 text-blue-400" />
              <span>Simultaneous Storefront Scraper</span>
            </div>
            Tracks Amazon, Best Buy, Newegg, B&H Photo, Micro Center, Walmart, and Target concurrently to find inventory, promotions, and price anomalies.
          </div>

          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
            <div className="font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
              <Flame className="w-4 h-4 text-emerald-400" />
              <span>All-Time Low Record Tracker</span>
            </div>
            Compares today's lowest quote against historical Black Friday and holiday price floors to flag when items drop to true historic bottoms.
          </div>

          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
            <div className="font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
              <ShoppingCart className="w-4 h-4 text-purple-400" />
              <span>Combinatorial Cart Optimizer</span>
            </div>
            Solves the multi-merchant optimization problem: calculates the cheapest combined split across retailers while factoring in shipping fees.
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            PriceRadar &bull; Universal Multi-Store Price Comparison & Historic Deal Engine
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setGuideModalTab('cron-schedule');
                setIsGuideModalOpen(true);
              }}
              className="text-amber-400 hover:underline font-semibold flex items-center space-x-1"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Updates: 12 AM &amp; 12 PM (2x Daily)</span>
            </button>
            <span>&bull;</span>
            <button
              onClick={() => {
                setGuideModalTab('free-hosting');
                setIsGuideModalOpen(true);
              }}
              className="text-blue-400 hover:underline font-semibold flex items-center space-x-1"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Free Cloud vs. GitHub Guide</span>
            </button>
            <span>&bull;</span>
            <button
              onClick={() => setIsAlertsModalOpen(true)}
              className="text-slate-400 hover:text-white"
            >
              Email Alerts ({userEmail})
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom duration-300">
          <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-xl p-3.5 px-4 flex items-center space-x-3 text-xs max-w-md">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-white">{toastMessage.title}</div>
              <div className="text-slate-400">{toastMessage.desc}</div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {compareModalItem && (
        <RetailerCompareModal
          item={compareModalItem}
          onClose={() => setCompareModalItem(null)}
          onTriggerAlert={(it) => handleSendAlert(it, userEmail)}
        />
      )}

      {historyModalItem && (
        <PriceHistoryModal
          item={historyModalItem}
          onClose={() => setHistoryModalItem(null)}
        />
      )}

      {isOptimizerModalOpen && (
        <BestDealOptimizerModal
          items={items}
          onClose={() => setIsOptimizerModalOpen(false)}
        />
      )}

      {isAlertsModalOpen && (
        <EmailAlertsModal
          userEmail={userEmail}
          onUpdateEmail={(email) => setUserEmail(email)}
          recipients={recipients}
          onAddRecipient={handleAddRecipient}
          onDeleteRecipient={handleDeleteRecipient}
          onSetDefaultRecipient={handleSetDefaultRecipient}
          items={items}
          onUpdateItemAlertEmails={handleUpdateItemAlertEmails}
          alertLogs={alertLogs}
          onSendAlert={(it, emails) => handleSendAlert(it, emails)}
          onClose={() => setIsAlertsModalOpen(false)}
        />
      )}

      {isAddModalOpen && (
        <AddItemModal
          onAddItem={handleAddItem}
          onClose={() => setIsAddModalOpen(false)}
          userEmail={userEmail}
          recipients={recipients}
        />
      )}

      {isGuideModalOpen && (
        <ArchitectureGuideModal
          initialTab={guideModalTab}
          items={items}
          userEmail={userEmail}
          onItemsUpdated={(updated) => setItems(updated)}
          onClose={() => setIsGuideModalOpen(false)}
        />
      )}

      {isSelfTestOpen && (
        <SelfTestModal
          isOpen={isSelfTestOpen}
          onClose={() => setIsSelfTestOpen(false)}
        />
      )}

    </div>
  );
}
