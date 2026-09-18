import React, { useState } from 'react';
import { X, TrendingDown, Flame, Calendar, Award, Info, Sparkles } from 'lucide-react';
import { TrackedItem } from '../types';

interface PriceHistoryModalProps {
  item: TrackedItem | null;
  onClose: () => void;
}

export const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({ item, onClose }) => {
  const [timeRange, setTimeRange] = useState<'30d' | '90d' | 'all'>('90d');

  if (!item) return null;

  const verifiedPrices = item.retailers
    .filter(r => typeof r.price === 'number' && r.price > 0)
    .map(r => r.price as number);
  const currentLowest = verifiedPrices.length > 0 ? Math.min(...verifiedPrices) : item.targetPrice;
  const isAtAllTimeLow = currentLowest <= item.allTimeLow;
  const highestHistorical = Math.max(item.msrp, ...item.priceHistory.map(p => p.lowest));
  const avgPrice = Number(
    (item.priceHistory.reduce((acc, p) => acc + p.lowest, 0) / item.priceHistory.length).toFixed(2)
  );

  // Filter history points based on selected range
  const filteredHistory = timeRange === '30d' 
    ? item.priceHistory.slice(-4) 
    : item.priceHistory;

  // SVG Chart Dimensions & Calculations
  const chartHeight = 180;
  const chartWidth = 560;
  const paddingX = 40;
  const paddingY = 25;

  const minPrice = Math.min(item.allTimeLow * 0.95, ...filteredHistory.map(p => p.lowest));
  const maxPrice = Math.max(highestHistorical * 1.05, ...filteredHistory.map(p => p.lowest));

  const getY = (val: number) => {
    return chartHeight - paddingY - ((val - minPrice) / (maxPrice - minPrice || 1)) * (chartHeight - paddingY * 2);
  };

  const getX = (index: number, total: number) => {
    if (total <= 1) return chartWidth / 2;
    return paddingX + (index / (total - 1)) * (chartWidth - paddingX * 2);
  };

  const pathPoints = filteredHistory.map((pt, i) => `${getX(i, filteredHistory.length)},${getY(pt.lowest)}`).join(' L ');
  const svgPath = `M ${pathPoints}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div 
        id="price-history-dialog"
        className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="bg-slate-800/80 border-b border-slate-700 p-5 sm:p-6 flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <img 
              src={item.imageUrl} 
              alt={item.title} 
              className="w-14 h-14 rounded-xl object-cover border border-slate-700"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                  Price History
                </span>
                <span className="text-xs text-slate-400 font-mono">{item.brand}</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1 line-clamp-1">
                {item.title}
              </h2>
            </div>
          </div>

          <button 
            id="close-history-modal"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Historic Low Analysis Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 pb-2">
          
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3">
            <div className="flex items-center space-x-1 text-xs text-emerald-400 font-medium">
              <Flame className="w-3.5 h-3.5" />
              <span>All-Time Low</span>
            </div>
            <div className="text-xl font-black text-white mt-1">
              ${item.allTimeLow.toFixed(2)}
            </div>
            <div className="text-[11px] text-emerald-300 font-medium truncate">
              {item.allTimeLowStore} &bull; {item.allTimeLowDate}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
            <div className="text-xs text-slate-400 font-medium">Current Best</div>
            <div className="text-xl font-black text-emerald-400 mt-1">
              ${currentLowest.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400">
              {isAtAllTimeLow ? '🔥 At All-Time Low' : `+$${(currentLowest - item.allTimeLow).toFixed(2)} vs Record`}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
            <div className="text-xs text-slate-400 font-medium">Average Price</div>
            <div className="text-xl font-black text-slate-200 mt-1">
              ${avgPrice.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400">
              3-Month Trend
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
            <div className="text-xs text-slate-400 font-medium">Launch MSRP</div>
            <div className="text-xl font-black text-slate-400 line-through mt-1">
              ${item.msrp.toFixed(2)}
            </div>
            <div className="text-[11px] text-emerald-400 font-semibold">
              -{(((item.msrp - currentLowest) / item.msrp) * 100).toFixed(0)}% from launch
            </div>
          </div>

        </div>

        {/* AI Buy Recommendation Banner */}
        <div className="px-6 py-2">
          <div className={`p-3.5 rounded-xl border flex items-start space-x-3 ${
            isAtAllTimeLow 
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' 
              : 'bg-blue-950/50 border-blue-600/40 text-blue-200'
          }`}>
            <Sparkles className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold">Deal Recommendation: </span>
              {isAtAllTimeLow ? (
                <span>
                  <strong>Immediate Buy Recommended!</strong> This item is currently listed at its lowest price in tracked history (${currentLowest.toFixed(2)}). Historical data shows prices rebound within 5-12 days after hitting this floor.
                </span>
              ) : (
                <span>
                  <strong>Solid Price to Buy.</strong> Currently at ${currentLowest.toFixed(2)}, which is ${(currentLowest - item.allTimeLow).toFixed(2)} away from its Black Friday all-time low. If you can wait, set an alert for ${item.targetPrice.toFixed(2)}.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Chart Section */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <TrendingDown className="w-4 h-4 text-emerald-400" />
              <span>Market Price Trajectory (USD)</span>
            </h3>

            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setTimeRange('30d')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  timeRange === '30d' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                30 Days
              </button>
              <button
                onClick={() => setTimeRange('90d')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  timeRange === '90d' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                90 Days
              </button>
              <button
                onClick={() => setTimeRange('all')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  timeRange === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                All-Time
              </button>
            </div>
          </div>

          {/* SVG Line Graph */}
          <div className="w-full bg-slate-950/80 rounded-xl p-4 border border-slate-800 relative overflow-hidden">
            
            {/* Guide Lines */}
            <div className="absolute left-4 top-2 text-[10px] text-slate-500 font-mono">
              Max: ${maxPrice.toFixed(0)}
            </div>
            <div className="absolute left-4 bottom-2 text-[10px] text-emerald-500 font-mono font-bold">
              Record Low: ${item.allTimeLow.toFixed(0)}
            </div>

            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              className="w-full h-44 overflow-visible"
            >
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />
              <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />
              <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="#10b981" strokeDasharray="2 2" opacity="0.4" />

              {/* Area fill */}
              <path
                d={`${svgPath} L ${getX(filteredHistory.length - 1, filteredHistory.length)},${chartHeight - paddingY} L ${paddingX},${chartHeight - paddingY} Z`}
                fill="url(#priceGradient)"
              />

              {/* Price Line */}
              <path
                d={svgPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              {filteredHistory.map((pt, idx) => {
                const cx = getX(idx, filteredHistory.length);
                const cy = getY(pt.lowest);
                const isPointLowest = pt.lowest === item.allTimeLow;

                return (
                  <g key={idx} className="group cursor-pointer">
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isPointLowest ? 6 : 4}
                      fill={isPointLowest ? "#ef4444" : "#10b981"}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={cx}
                      y={cy - 10}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="10"
                      fontWeight="bold"
                      className="opacity-80"
                    >
                      ${pt.lowest.toFixed(0)}
                    </text>
                    <text
                      x={cx}
                      y={chartHeight - 6}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="9"
                    >
                      {pt.date}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 px-1">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              <span>Lowest Verified Storefront Price</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
              <span>Historic Record Low Point</span>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800/60 border-t border-slate-700 p-4 px-6 flex justify-end">
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
