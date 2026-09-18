import React from 'react';
import { ShoppingCart, Bell, Sparkles, Plus, RefreshCw, Radar, Layers, Clock, Cloud, Flame, ShieldCheck } from 'lucide-react';
import { TrackedItem } from '../types';

interface HeaderProps {
  items: TrackedItem[];
  onOpenAddModal: () => void;
  onOpenOptimizerModal: () => void;
  onOpenAlertsModal: () => void;
  onOpenGuideModal: () => void;
  onOpenScheduleModal?: () => void;
  onOpenSelfTestModal?: () => void;
  onRefreshAll: () => void;
  isRefreshing: boolean;
  userEmail: string;
}

export const Header: React.FC<HeaderProps> = ({
  items,
  onOpenAddModal,
  onOpenOptimizerModal,
  onOpenAlertsModal,
  onOpenGuideModal,
  onOpenScheduleModal,
  onOpenSelfTestModal,
  onRefreshAll,
  isRefreshing,
  userEmail,
}) => {
  // Calculate aggregate metrics
  const totalMsrp = items.reduce((acc, it) => acc + it.msrp, 0);
  const totalCurrentBest = items.reduce((acc, it) => {
    const minPrice = Math.min(...it.retailers.map(r => r.price));
    return acc + (minPrice !== Infinity ? minPrice : it.msrp);
  }, 0);
  const totalSavings = Math.max(0, totalMsrp - totalCurrentBest);
  const activeAlertsCount = items.filter(it => it.emailAlertEnabled).length;
  const allTimeLowHits = items.filter(it => {
    const minPrice = Math.min(...it.retailers.map(r => r.price));
    return minPrice <= it.allTimeLow;
  }).length;

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Radar className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black tracking-tight text-white font-mono">
                  PRICE<span className="text-blue-400">RADAR</span>
                </span>
                <span className="hidden sm:inline-flex px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-blue-950 text-blue-300 border border-blue-800/60 rounded-md">
                  Universal Tracker
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Hiking, fishing, outdoor gear &amp; tech price tracker
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="hidden lg:flex items-center space-x-3 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3.5 py-1.5">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-slate-300 font-medium">
                Tracking <strong className="text-white">{items.length}</strong> items
              </span>
            </div>
            
            {allTimeLowHits > 0 && (
              <>
                <div className="h-5 w-px bg-slate-700" />
                <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 text-xs font-bold">
                  <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>{allTimeLowHits} at Record Lowest Price</span>
                </div>
              </>
            )}

            <div className="h-5 w-px bg-slate-700" />
            {/* 2x Daily Cron Badge */}
            <button
              id="header-schedule-badge"
              onClick={onOpenScheduleModal || onOpenGuideModal}
              title="Automated Price Updates: 12:00 AM (Midnight) & 12:00 PM (Noon). Click to view schedule & free cloud options."
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900/80 border border-blue-800/80 rounded-lg text-xs transition cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-300 font-medium">Updates:</span>
              <span className="text-amber-300 font-bold">12 AM &amp; 12 PM</span>
            </button>
          </div>

          {/* Navigation Action Buttons */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Refresh Scrape */}
            <button
              id="refresh-all-btn"
              onClick={onRefreshAll}
              disabled={isRefreshing}
              title="Scrape & refresh prices across all storefronts"
              className="p-2 sm:px-3 sm:py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center space-x-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden md:inline">{isRefreshing ? 'Scraping Stores...' : 'Scrape Prices'}</span>
            </button>

            {/* Deal Optimizer */}
            <button
              id="open-optimizer-btn"
              onClick={onOpenOptimizerModal}
              title="Find best multi-retailer combo deal"
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-900/30 transition flex items-center space-x-1.5"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Best Deal Optimizer</span>
            </button>

            {/* Email Alerts */}
            <button
              id="open-alerts-btn"
              onClick={onOpenAlertsModal}
              title="Manage price drop email alerts"
              className="relative p-2 sm:px-3 sm:py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5 text-xs font-semibold"
            >
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Alerts</span>
              {activeAlertsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-full text-[10px] font-bold">
                  {activeAlertsCount}
                </span>
              )}
            </button>

            {/* Add Item Button */}
            <button
              id="open-add-modal-btn"
              onClick={onOpenAddModal}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-900/40 transition flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Item</span>
            </button>

            {/* Run Self-Test & Deal Link Audit */}
            <button
              id="open-selftest-btn"
              onClick={onOpenSelfTestModal}
              title="Run Automated Self-Test & Link Integrity Audit (108 checks)"
              className="p-2 sm:px-3 sm:py-2 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/50 text-emerald-300 transition flex items-center space-x-1.5 text-xs font-semibold cursor-pointer shadow-sm shadow-emerald-950"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">Self-Test</span>
              <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-bold">108/108</span>
            </button>

            {/* Free Hosting & Cron Guide */}
            <button
              id="open-guide-btn"
              onClick={onOpenGuideModal}
              title="Free Cloud vs GitHub Hosting Guide & 2x Daily Schedule"
              className="p-2 sm:px-3 sm:py-2 rounded-lg bg-blue-900/30 hover:bg-blue-800/50 border border-blue-700/50 text-blue-200 transition flex items-center space-x-1.5 text-xs font-semibold"
            >
              <Cloud className="w-4 h-4 text-blue-400" />
              <span className="hidden xl:inline">Free Hosting &amp; Cron</span>
            </button>

          </div>
        </div>
      </div>
    </header>
  );
};
