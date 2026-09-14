import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  Sparkles, 
  Link, 
  Search, 
  Check, 
  Cpu, 
  TrendingDown, 
  RefreshCw 
} from 'lucide-react';
import { TrackedItem, RetailerPrice, EmailRecipient } from '../types';
import { POPULAR_ITEM_PRESETS } from '../data/catalog';

interface AddItemModalProps {
  onAddItem: (item: TrackedItem) => void;
  onClose: () => void;
  userEmail: string;
  recipients?: EmailRecipient[];
}

export const AddItemModal: React.FC<AddItemModalProps> = ({
  onAddItem,
  onClose,
  userEmail,
  recipients = [],
}) => {
  const [activeTab, setActiveTab] = useState<'custom' | 'presets'>('custom');
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<string>('All');

  // Multi-email recipient selection
  const [selectedEmails, setSelectedEmails] = useState<string[]>(() => {
    if (recipients.length > 0) {
      const defaultRec = recipients.find(r => r.isDefault);
      return [defaultRec ? defaultRec.email : recipients[0].email];
    }
    return [userEmail || 'abelchen1985@gmail.com'];
  });
  const [customEmailInput, setCustomEmailInput] = useState('');

  // Custom Form Fields
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<TrackedItem['category']>('Hiking & Backpacking');
  const [model, setModel] = useState('');
  const [msrp, setMsrp] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedPreview, setScrapedPreview] = useState<any | null>(null);

  const handleLiveScrapePreview = async () => {
    if (!title.trim() && !productUrl.trim()) return;

    setIsScraping(true);
    try {
      const res = await fetch('/api/scrape-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: title || productUrl,
          url: productUrl,
        })
      });
      const data = await res.json();
      if (data.data) {
        setScrapedPreview(data.data);
        if (data.data.allTimeLow && !targetPrice) {
          setTargetPrice(data.data.allTimeLow.toString());
        }
        if (!msrp && data.data.retailers?.[0]?.originalPrice) {
          setMsrp(data.data.retailers[0].originalPrice.toString());
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsScraping(false);
    }
  };

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const msrpNum = parseFloat(msrp) || 199.99;
    const targetNum = parseFloat(targetPrice) || msrpNum * 0.85;

    // Build initial retailers
    let retailers: RetailerPrice[] = [];
    let allTimeLowVal = targetNum * 0.95;
    let allTimeLowStore = 'Micro Center';
    let allTimeLowDate = 'Nov 2024';

    if (scrapedPreview?.retailers && scrapedPreview.retailers.length > 0) {
      retailers = scrapedPreview.retailers.map((r: any, idx: number) => ({
        id: `r-cust-${Date.now()}-${idx}`,
        retailerName: r.retailerName,
        url: r.url || productUrl || 'https://amazon.com',
        price: r.price,
        originalPrice: r.originalPrice || msrpNum,
        inStock: r.inStock ?? true,
        stockMessage: r.stockMessage || 'In Stock',
        shipping: r.shipping || 'Free Shipping',
        shippingCost: r.shippingCost || 0,
        promoCode: r.promoCode,
        rating: r.rating || 4.7,
        reviewCount: r.reviewCount || 450,
        isBestPrice: r.isBestPrice
      }));

      if (scrapedPreview.allTimeLow) {
        allTimeLowVal = scrapedPreview.allTimeLow;
        allTimeLowStore = scrapedPreview.allTimeLowStore || 'Amazon';
        allTimeLowDate = scrapedPreview.allTimeLowDate || 'Last Month';
      }
    } else {
      retailers = [
        {
          id: `r-cust-${Date.now()}-amz`,
          retailerName: 'Amazon',
          url: productUrl || 'https://amazon.com',
          price: Number((msrpNum * 0.92).toFixed(2)),
          originalPrice: msrpNum,
          inStock: true,
          stockMessage: 'In Stock - Prime Eligible',
          shipping: 'Free Shipping',
          shippingCost: 0,
          rating: 4.8,
          reviewCount: 1200,
          isBestPrice: true
        },
        {
          id: `r-cust-${Date.now()}-wm`,
          retailerName: 'Walmart',
          url: 'https://walmart.com',
          price: Number((msrpNum * 0.93).toFixed(2)),
          originalPrice: msrpNum,
          inStock: true,
          stockMessage: 'In Stock - Free 2-day Delivery',
          shipping: 'Free Shipping',
          shippingCost: 0,
          rating: 4.6,
          reviewCount: 780,
          isBestPrice: false
        },
        {
          id: `r-cust-${Date.now()}-tgt`,
          retailerName: 'Target',
          url: 'https://target.com',
          price: Number((msrpNum * 0.95).toFixed(2)),
          originalPrice: msrpNum,
          inStock: true,
          stockMessage: 'In Stock - Pickup or Ship',
          shipping: 'Free Shipping',
          shippingCost: 0,
          rating: 4.7,
          reviewCount: 420,
          isBestPrice: false
        },
        {
          id: `r-cust-${Date.now()}-bb`,
          retailerName: 'Best Buy',
          url: 'https://bestbuy.com',
          price: Number((msrpNum * 0.96).toFixed(2)),
          originalPrice: msrpNum,
          inStock: true,
          stockMessage: 'In Stock',
          shipping: 'Free Shipping',
          shippingCost: 0,
          rating: 4.7,
          reviewCount: 540,
          isBestPrice: false
        }
      ];
    }

    const newItem: TrackedItem = {
      id: `item-${Date.now()}`,
      title: title.trim(),
      category,
      brand: brand.trim() || 'Custom Brand',
      model: model.trim() || 'Model-X',
      imageUrl: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=300&auto=format&fit=crop&q=80',
      msrp: msrpNum,
      allTimeLow: allTimeLowVal,
      allTimeLowDate,
      allTimeLowStore,
      targetPrice: targetNum,
      emailAlertEnabled: true,
      userEmail: selectedEmails[0] || userEmail,
      alertEmails: selectedEmails.length > 0 ? selectedEmails : [userEmail],
      alertCondition: 'below_target',
      lastUpdated: 'Just added',
      retailers,
      priceHistory: [
        { date: '90d ago', lowest: msrpNum },
        { date: '60d ago', lowest: msrpNum * 0.96 },
        { date: '30d ago', lowest: msrpNum * 0.94 },
        { date: 'Today', lowest: Math.min(...retailers.map(r => r.price)) }
      ],
      isCustom: true
    };

    onAddItem(newItem);
    onClose();
  };

  const handleAddPreset = (preset: typeof POPULAR_ITEM_PRESETS[0]) => {
    const newItem: TrackedItem = {
      id: `preset-${Date.now()}`,
      title: preset.title,
      category: preset.category,
      brand: preset.brand,
      model: preset.model,
      imageUrl: preset.imageUrl,
      msrp: preset.msrp,
      allTimeLow: preset.allTimeLow,
      allTimeLowDate: preset.allTimeLowDate,
      allTimeLowStore: preset.allTimeLowStore,
      targetPrice: preset.targetPrice,
      emailAlertEnabled: true,
      userEmail: selectedEmails[0] || userEmail,
      alertEmails: selectedEmails.length > 0 ? selectedEmails : [userEmail],
      alertCondition: 'below_target',
      lastUpdated: 'Just added',
      retailers: [
        {
          id: `pr-${Date.now()}-1`,
          retailerName: 'Amazon',
          url: 'https://amazon.com',
          price: preset.currentBestPrice + 10,
          originalPrice: preset.msrp,
          inStock: true,
          stockMessage: 'In Stock',
          shipping: 'Free Shipping',
          shippingCost: 0,
          rating: 4.8,
          reviewCount: 1800,
          isBestPrice: preset.bestRetailer === 'Amazon'
        },
        {
          id: `pr-${Date.now()}-2`,
          retailerName: 'Best Buy',
          url: 'https://bestbuy.com',
          price: preset.currentBestPrice,
          originalPrice: preset.msrp,
          inStock: true,
          stockMessage: 'In Stock',
          shipping: 'Free Shipping',
          shippingCost: 0,
          rating: 4.9,
          reviewCount: 940,
          isBestPrice: preset.bestRetailer === 'Best Buy'
        },
        {
          id: `pr-${Date.now()}-3`,
          retailerName: 'Newegg',
          url: 'https://newegg.com',
          price: preset.currentBestPrice + 5,
          originalPrice: preset.msrp,
          inStock: true,
          stockMessage: 'In Stock',
          shipping: 'Free Shipping',
          shippingCost: 0,
          rating: 4.7,
          reviewCount: 420,
          isBestPrice: preset.bestRetailer === 'Newegg'
        }
      ],
      priceHistory: [
        { date: '90d ago', lowest: preset.msrp },
        { date: '60d ago', lowest: preset.msrp * 0.95 },
        { date: '30d ago', lowest: preset.currentBestPrice + 15 },
        { date: 'Today', lowest: preset.currentBestPrice }
      ]
    };

    onAddItem(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div 
        id="add-item-dialog"
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="bg-slate-800/80 border-b border-slate-700 p-5 sm:p-6 flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                PriceRadar Universal Watchlist
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              Add Any Item to Track
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste any product title or retailer URL (Amazon, Walmart, Target, Best Buy & more) to track price drops across all storefronts.
            </p>
          </div>

          <button 
            id="close-add-modal"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'custom' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Enter Custom Item / URL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'presets' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Browse Popular Presets (1-Click Add)
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'custom' ? (
            <form onSubmit={handleSubmitCustom} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Product Name or Exact Model *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. AMD Ryzen 9 7950X3D or Sony WH-1000XM5"
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleLiveScrapePreview}
                    disabled={isScraping || !title.trim()}
                    title="Live check current retailer prices"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin text-blue-400' : ''}`} />
                    <span>{isScraping ? 'Scraping...' : 'Fetch Live Prices'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Storefront URL (Optional)
                </label>
                <div className="relative">
                  <Link className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="url"
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    placeholder="https://amazon.com/dp/... or https://bestbuy.com/site/..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="Hiking & Backpacking">Hiking &amp; Backpacking</option>
                    <option value="Fishing & Angling">Fishing &amp; Angling</option>
                    <option value="Camping & Bushcraft">Camping &amp; Bushcraft</option>
                    <option value="Outdoor Apparel & Boots">Outdoor Apparel &amp; Boots</option>
                    <option value="Kayaking & Water Sports">Kayaking &amp; Water Sports</option>
                    <option value="Hunting & Optics">Hunting &amp; Optics</option>
                    <option value="Audio & Headphones">Audio &amp; Headphones</option>
                    <option value="Gaming & Consoles">Gaming &amp; Consoles</option>
                    <option value="Home & Kitchen">Home &amp; Kitchen</option>
                    <option value="Appliances">Appliances &amp; Vacuums</option>
                    <option value="Smartphones & Tablets">Smartphones &amp; Tablets</option>
                    <option value="Laptops & Computers">Laptops &amp; Computers</option>
                    <option value="Tools & Hardware">Tools &amp; Hardware</option>
                    <option value="Smart Home">Smart Home &amp; Security</option>
                    <option value="Cameras & Drones">Cameras &amp; Drones</option>
                    <option value="PC Components">PC Components</option>
                    <option value="Electronics">Electronics &amp; Gadgets</option>
                    <option value="Other">Other Product</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Osprey, Shimano, Garmin, YETI, Sony, Apple"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    MSRP / Reference Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={msrp}
                    onChange={(e) => setMsrp(e.target.value)}
                    placeholder="e.g. 399.99"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    Email Alert Target Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="e.g. 320.00"
                    className="w-full px-3 py-2 bg-slate-950 border border-emerald-500/80 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Triggers instant alert whenever price drops to this deal threshold.
                  </p>
                </div>
              </div>

              {/* Multi-Inbox Notification Selector */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <span>Send Deal Alerts To</span>
                    <span className="text-[11px] font-normal text-amber-400">({selectedEmails.length} inbox{selectedEmails.length !== 1 ? 'es' : ''} selected)</span>
                  </label>
                  <span className="text-[11px] text-slate-500">Supports different emails per item</span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {recipients.map((r) => {
                    const isSelected = selectedEmails.includes(r.email);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (selectedEmails.length > 1) {
                              setSelectedEmails(selectedEmails.filter(e => e !== r.email));
                            }
                          } else {
                            setSelectedEmails([...selectedEmails, r.email]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500/80 text-amber-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full inline-block bg-current" />
                        <span>{r.label}</span>
                        <span className="text-[10px] opacity-75 font-mono">({r.email.split('@')[0]})</span>
                        {isSelected && <Check className="w-3.5 h-3.5 ml-1" />}
                      </button>
                    );
                  })}
                </div>

                {/* Optional custom one-off email addition */}
                <div className="flex items-center space-x-2 pt-2 text-xs">
                  <input
                    type="email"
                    value={customEmailInput}
                    onChange={(e) => setCustomEmailInput(e.target.value)}
                    placeholder="Or type another email for this item..."
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customEmailInput.includes('@') && !selectedEmails.includes(customEmailInput.trim())) {
                        setSelectedEmails([...selectedEmails, customEmailInput.trim()]);
                        setCustomEmailInput('');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs border border-slate-700 transition cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Scraped Preview Card */}
              {scrapedPreview && (
                <div className="p-3 bg-slate-950 border border-emerald-500/40 rounded-xl text-xs space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center justify-between">
                    <span>Live Store Prices Detected:</span>
                    <span>All-Time Low: ${scrapedPreview.allTimeLow}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {scrapedPreview.retailers?.map((r: any, i: number) => (
                      <span key={i} className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-200">
                        {r.retailerName}: <strong>${r.price}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-900/30 flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to Tracker List</span>
                </button>
              </div>

            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Click any gear preset to instantly add it to your tracking list with pre-configured historical lows:
                </p>

                {/* Preset filter chips */}
                <div className="flex items-center space-x-1.5 shrink-0 overflow-x-auto">
                  {['All', 'Hiking', 'Fishing', 'Camping', 'Tech'].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPresetCategoryFilter(tab)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        presetCategoryFilter === tab
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                {POPULAR_ITEM_PRESETS
                  .filter(preset => {
                    if (presetCategoryFilter === 'All') return true;
                    if (presetCategoryFilter === 'Hiking') return preset.category.toLowerCase().includes('hiking');
                    if (presetCategoryFilter === 'Fishing') return preset.category.toLowerCase().includes('fishing');
                    if (presetCategoryFilter === 'Camping') return preset.category.toLowerCase().includes('camping');
                    if (presetCategoryFilter === 'Tech') return !preset.category.toLowerCase().includes('hiking') && !preset.category.toLowerCase().includes('fishing') && !preset.category.toLowerCase().includes('camping');
                    return true;
                  })
                  .map((preset, index) => (
                  <div
                    key={index}
                    className="p-3 bg-slate-950/70 border border-slate-800 hover:border-blue-500/60 rounded-xl transition flex flex-col justify-between"
                  >
                    <div className="flex items-start space-x-3">
                      <img 
                        src={preset.imageUrl} 
                        alt={preset.title}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded">
                          {preset.category}
                        </span>
                        <h4 className="text-xs font-bold text-white mt-1 line-clamp-2">
                          {preset.title}
                        </h4>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Record Low: <span className="text-emerald-400 font-bold">${preset.allTimeLow.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-slate-400">Current: </span>
                        <span className="font-bold text-emerald-400">${preset.currentBestPrice.toFixed(2)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddPreset(preset)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Track Item</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
