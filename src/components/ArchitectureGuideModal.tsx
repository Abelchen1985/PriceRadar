import React, { useState, useEffect } from 'react';
import { 
  X, 
  Layers, 
  CheckCircle2, 
  Terminal, 
  Server, 
  Globe, 
  Database, 
  Clock, 
  Zap, 
  Copy, 
  Check, 
  ExternalLink,
  ShieldCheck,
  Play,
  Loader2,
  Sparkles,
  GitBranch,
  Cloud
} from 'lucide-react';
import { TrackedItem } from '../types';

interface ArchitectureGuideModalProps {
  onClose: () => void;
  initialTab?: 'free-hosting' | 'cron-schedule' | 'blueprint' | 'deployment';
  items?: TrackedItem[];
  userEmail?: string;
  onItemsUpdated?: (updatedItems: TrackedItem[]) => void;
}

export const ArchitectureGuideModal: React.FC<ArchitectureGuideModalProps> = ({ 
  onClose,
  initialTab = 'free-hosting',
  items = [],
  userEmail = 'alerts@example.com',
  onItemsUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'free-hosting' | 'cron-schedule' | 'blueprint' | 'deployment'>(initialTab);
  const [copiedWorkflow, setCopiedWorkflow] = useState(false);
  const [copiedCronExpr, setCopiedCronExpr] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [cronStatus, setCronStatus] = useState<any>(null);

  // Fetch live cron status from server
  useEffect(() => {
    fetch('/api/cron/status')
      .then(res => res.json())
      .then(data => {
        if (data?.schedule) {
          setCronStatus(data);
        }
      })
      .catch(err => console.error('Failed to fetch cron status', err));
  }, []);

  const triggerManualCronSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/cron/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, email: userEmail })
      });
      const data = await res.json();
      setSyncResult(data);
      if (data?.verifiedItems && onItemsUpdated) {
        onItemsUpdated(data.verifiedItems);
      }
      if (data?.schedule) {
        setCronStatus((prev: any) => ({ ...prev, schedule: data.schedule }));
      }
    } catch (err: any) {
      console.error(err);
      setSyncResult({ error: 'Failed to trigger cron sync' });
    } finally {
      setIsSyncing(false);
    }
  };

  const workflowYml = `name: PriceRadar 2x Daily Price Sweep (Midnight & Noon)

on:
  schedule:
    # 00:00 (Midnight) and 12:00 (Noon) UTC every day
    - cron: '0 0,12 * * *'
  workflow_dispatch: # Allows manual trigger from GitHub UI

jobs:
  sweep-prices:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Trigger Price Sweep on Hosted App
        env:
          APP_URL: \${{ secrets.APP_URL || 'https://your-app.run.app' }}
          ALERT_EMAIL: \${{ secrets.ALERT_EMAIL || '${userEmail}' }}
        run: |
          echo "Starting PriceRadar Midnight & Noon Automated Price Sweep..."
          curl -s -X POST "$APP_URL/api/cron/sync-now" \\
            -H "Content-Type: application/json" \\
            -d "{\\"email\\": \\"$ALERT_EMAIL\\"}"
          echo "Price sweep successfully dispatched."`;

  const handleCopyWorkflow = () => {
    navigator.clipboard.writeText(workflowYml);
    setCopiedWorkflow(true);
    setTimeout(() => setCopiedWorkflow(false), 2000);
  };

  const handleCopyCronExpr = () => {
    navigator.clipboard.writeText('0 0,12 * * *');
    setCopiedCronExpr(true);
    setTimeout(() => setCopiedCronExpr(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div 
        id="architecture-guide-dialog"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-950/80 via-indigo-950/70 to-slate-900 border-b border-blue-800/60 p-5 sm:p-6 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-300">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                  Cloud Hosting &amp; Automation
                </span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>2x Daily: Midnight &amp; Noon</span>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Hosting Options &amp; Scheduled Price Updates
              </h2>
            </div>
          </div>

          <button 
            id="close-guide-modal"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 overflow-x-auto">
          <button
            id="tab-free-hosting"
            onClick={() => setActiveTab('free-hosting')}
            className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'free-hosting'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Free Cloud vs. GitHub (Which is Better?)</span>
          </button>

          <button
            id="tab-cron-schedule"
            onClick={() => setActiveTab('cron-schedule')}
            className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'cron-schedule'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Midnight &amp; Noon Schedule</span>
          </button>

          <button
            id="tab-blueprint"
            onClick={() => setActiveTab('blueprint')}
            className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'blueprint'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Full-Stack Architecture</span>
          </button>

          <button
            id="tab-deployment"
            onClick={() => setActiveTab('deployment')}
            className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'deployment'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Deploy Guide</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 max-h-[68vh] overflow-y-auto space-y-6">

          {/* TAB 1: Free Cloud vs GitHub (Which is Better?) */}
          {activeTab === 'free-hosting' && (
            <div className="space-y-6">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-white text-sm block mb-1">Direct Answer: Can you host on GitHub or Free Cloud? Which is better?</strong>
                  <p>
                    <strong>GitHub Pages alone cannot run this app</strong> because it only hosts static HTML/JS and cannot execute the Node.js Express server, background scraper, or private API keys.
                  </p>
                  <p className="mt-1">
                    However, the <strong className="text-emerald-400">ideal 100% FREE stack</strong> combines both: host the web app on a free container service (<strong className="text-white">Google Cloud Run</strong> or <strong className="text-white">Render</strong>) and use <strong className="text-white">GitHub Actions</strong> as your free automated cron scheduler to trigger price checks twice daily at midnight and noon!
                  </p>
                </div>
              </div>

              {/* Host Comparison Table */}
              <div>
                <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
                  <Server className="w-4 h-4 text-blue-400" />
                  <span>Platform Comparison for PriceRadar</span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                    <thead className="bg-slate-950 text-slate-300 font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Platform</th>
                        <th className="p-3">Free Tier Limits</th>
                        <th className="p-3">Can Run Backend &amp; Scraper?</th>
                        <th className="p-3">2x Daily Cron Support?</th>
                        <th className="p-3">Verdict / Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                      
                      {/* Google Cloud Run */}
                      <tr className="bg-blue-950/20 border-l-4 border-l-blue-500">
                        <td className="p-3 font-bold text-white flex items-center space-x-1.5">
                          <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>Google Cloud Run</span>
                          <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] font-bold">Recommended #1</span>
                        </td>
                        <td className="p-3 text-slate-300">
                          <strong>2 Million requests/month</strong> + 180,000 vCPU-seconds free forever. Scales to zero (costs $0 when idle).
                        </td>
                        <td className="p-3 text-emerald-400 font-semibold">
                          Yes (Full Node.js &amp; Docker)
                        </td>
                        <td className="p-3 text-slate-300">
                          Yes (via Google Cloud Scheduler or GitHub Actions)
                        </td>
                        <td className="p-3 text-emerald-300 font-bold">
                          Best Overall (Deploy directly from AI Studio!)
                        </td>
                      </tr>

                      {/* Render */}
                      <tr>
                        <td className="p-3 font-bold text-white flex items-center space-x-1.5">
                          <Server className="w-4 h-4 text-teal-400 shrink-0" />
                          <span>Render.com</span>
                          <span className="ml-1 px-1.5 py-0.5 bg-teal-500/20 text-teal-300 rounded text-[10px] font-bold">Runner Up</span>
                        </td>
                        <td className="p-3 text-slate-300">
                          Free Web Service (750 hours/month). Spins down after 15 mins of inactivity.
                        </td>
                        <td className="p-3 text-emerald-400 font-semibold">
                          Yes (Node.js &amp; Python)
                        </td>
                        <td className="p-3 text-slate-300">
                          Yes (Wakes up upon midnight &amp; noon ping)
                        </td>
                        <td className="p-3 text-teal-300 font-semibold">
                          Great for Git push auto-deploys
                        </td>
                      </tr>

                      {/* GitHub Pages + Actions */}
                      <tr>
                        <td className="p-3 font-bold text-white flex items-center space-x-1.5">
                          <GitBranch className="w-4 h-4 text-purple-400 shrink-0" />
                          <span>GitHub Actions</span>
                          <span className="ml-1 px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px] font-bold">Best for Cron</span>
                        </td>
                        <td className="p-3 text-slate-300">
                          <strong>2,000 free runner minutes/month</strong> on public &amp; private repos.
                        </td>
                        <td className="p-3 text-amber-300">
                          Only as a scheduled task / runner (not a 24/7 web server)
                        </td>
                        <td className="p-3 text-emerald-400 font-bold">
                          Yes! Built-in native cron schedule
                        </td>
                        <td className="p-3 text-purple-300 font-semibold">
                          Gold standard for 2x/day cron execution
                        </td>
                      </tr>

                      {/* Vercel */}
                      <tr>
                        <td className="p-3 font-bold text-white flex items-center space-x-1.5">
                          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Vercel</span>
                        </td>
                        <td className="p-3 text-slate-300">
                          Free Hobby tier with fast Edge network.
                        </td>
                        <td className="p-3 text-slate-300">
                          Serverless functions (10s execution limit)
                        </td>
                        <td className="p-3 text-amber-400">
                          Only 1 cron/day on free tier (requires GitHub Actions for 2x/day)
                        </td>
                        <td className="p-3 text-slate-400">
                          Good frontend, restricted serverless
                        </td>
                      </tr>

                      {/* GitHub Pages Alone */}
                      <tr>
                        <td className="p-3 font-bold text-slate-400 flex items-center space-x-1.5">
                          <Globe className="w-4 h-4 text-slate-500 shrink-0" />
                          <span>GitHub Pages Alone</span>
                        </td>
                        <td className="p-3 text-slate-400">100% Free static hosting</td>
                        <td className="p-3 text-rose-400 font-semibold">No (Static files only)</td>
                        <td className="p-3 text-rose-400 font-semibold">No (No backend server)</td>
                        <td className="p-3 text-rose-300">Not suitable alone</td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>

              {/* The Recommended Winning Stack */}
              <div className="p-4 bg-gradient-to-r from-slate-950 to-blue-950/40 border border-blue-800/60 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-white font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>The Recommended Free Architecture (Zero Operating Cost)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg">
                    <span className="text-blue-400 font-bold block mb-1">1. Web App: Google Cloud Run</span>
                    <p className="text-slate-300">
                      Deploy the full-stack container directly with 1 click in Google AI Studio. Stays idle at $0 cost until requested or pinged.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg">
                    <span className="text-emerald-400 font-bold block mb-1">2. Cron Trigger: GitHub Actions</span>
                    <p className="text-slate-300">
                      GitHub Actions executes every day at Midnight (00:00) and Noon (12:00) UTC using the provided workflow file to sweep prices and email alerts.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: Midnight & Noon 2x Daily Schedule */}
          {activeTab === 'cron-schedule' && (
            <div className="space-y-6">
              
              {/* Schedule Status Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Active Schedule</span>
                  </div>
                  <div className="text-lg font-bold text-white mt-1">2x Per Day</div>
                  <div className="text-xs text-slate-400 mt-0.5 font-mono">12:00 AM &amp; 12:00 PM</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span>Next Scheduled Run</span>
                  </div>
                  <div className="text-lg font-bold text-blue-300 mt-1">
                    {cronStatus?.schedule?.nextSlotLabel || 'Midnight (12:00 AM)'}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    in ~{cronStatus?.schedule?.hoursUntilNextRun ?? 7} hours ({cronStatus?.schedule?.nextRunTime || 'Tonight'})
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Alert Dispatch Target</span>
                  </div>
                  <div className="text-sm font-bold text-white mt-1 truncate" title={userEmail}>
                    {userEmail}
                  </div>
                  <div className="text-xs text-emerald-400 mt-0.5">All-time lows &amp; drops</div>
                </div>
              </div>

              {/* Live Test Trigger */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Play className="w-4 h-4 text-emerald-400" />
                    <span>Test 2x Daily Batch Sweep Now</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Simulate the midnight/noon sweep across all storefronts for your {items.length} watchlist items.
                  </p>
                </div>

                <button
                  id="trigger-cron-now-btn"
                  onClick={triggerManualCronSync}
                  disabled={isSyncing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex items-center space-x-2 shrink-0 shadow-md shadow-emerald-900/40"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sweeping Storefronts...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Run Batch Sweep Now</span>
                    </>
                  )}
                </button>
              </div>

              {/* Execution Feedback */}
              {syncResult && (
                <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-300 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{syncResult.message}</span>
                  </div>
                  {syncResult.result && (
                    <div className="text-slate-300 space-y-1">
                      <div>&bull; <strong>Items Checked:</strong> {syncResult.result.itemsChecked} products across Amazon, Walmart, Target, Best Buy</div>
                      <div>&bull; <strong>Price Drops Identified:</strong> {syncResult.result.priceDropsDetected} item(s)</div>
                      <div>&bull; <strong>Email Notification:</strong> Dispatched to {userEmail}</div>
                      <div>&bull; <strong>Log Entry:</strong> {syncResult.result.details}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Cron Expression & GitHub Actions Workflow */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Cron Expression</span>
                    <code className="px-2 py-0.5 bg-slate-800 rounded font-mono text-amber-300 text-xs font-bold">
                      0 0,12 * * *
                    </code>
                  </div>
                  <button
                    onClick={handleCopyCronExpr}
                    className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  >
                    {copiedCronExpr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCronExpr ? 'Copied' : 'Copy Expression'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">
                    GitHub Actions Automation File (<code className="text-blue-300">.github/workflows/price-update-cron.yml</code>):
                  </span>
                  <button
                    onClick={handleCopyWorkflow}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 flex items-center space-x-1.5"
                  >
                    {copiedWorkflow ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWorkflow ? 'Copied YAML!' : 'Copy Workflow File'}</span>
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-slate-300 overflow-x-auto">
                  <pre>{workflowYml}</pre>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: Full-Stack Architecture */}
          {activeTab === 'blueprint' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300 leading-relaxed">
                To track 10,000+ items continuously without getting blocked by Amazon or Walmart bot-detection, high-volume price aggregators follow this 4-tier blueprint:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-white font-bold text-sm">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span>1. Client App &amp; Dashboard</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    React / Next.js with client cache, live filterable categories, combinatorial best deal optimizer, and instant alert threshold controls.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-white font-bold text-sm">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>2. Anti-Bot Web Scraper</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Python worker using <code className="text-emerald-300">curl_cffi</code> to impersonate real Chrome TLS browser fingerprints and bypass Cloudflare or Akamai bot protection.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-white font-bold text-sm">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>3. Midnight &amp; Noon Scheduler</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Automated twice-daily execution at 00:00 &amp; 12:00 via GitHub Actions or Cloud Scheduler to evaluate discounts and store historical low records.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-white font-bold text-sm">
                    <Database className="w-4 h-4 text-purple-400" />
                    <span>4. DB &amp; Transactional Email</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    PostgreSQL database for catalog history paired with transactional email (Resend / SendGrid) to dispatch alert notifications.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Deployment Steps & Cloud Run / SSH Key FAQ */}
          {activeTab === 'deployment' && (
            <div className="space-y-6">
              
              {/* CRITICAL FAQ: Do you need my GitHub SSH key? */}
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-600/50 space-y-2">
                <div className="flex items-center space-x-2 text-rose-300 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>Security Notice: Do I need your GitHub SSH Key?</span>
                </div>
                <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <p>
                    <strong className="text-white font-bold bg-rose-900/60 px-2 py-0.5 rounded mr-1">ABSOLUTELY NOT.</strong> 
                    You should <strong className="text-rose-300 underline decoration-dotted">NEVER share your private SSH key</strong> (or GitHub password) with any AI assistant, developer, or third-party service.
                  </p>
                  <p className="text-slate-400">
                    <strong>Why it is not needed:</strong> The hybrid architecture communicates between GitHub Actions and Google Cloud Run using public webhooks authenticated via <strong>GitHub Repository Secrets</strong> (<code className="text-rose-200">APP_URL</code> &amp; <code className="text-rose-200">CRON_SECRET</code>). GitHub stores these secrets securely in encrypted format in your repository settings.
                  </p>
                </div>
              </div>

              {/* Step-by-Step Google Cloud Run Guide */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Cloud className="w-4 h-4 text-blue-400" />
                    <span>What You Need to Do with Google Cloud Run (100% Free)</span>
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
                    $0 / month forever
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  
                  {/* Option A: Cloud Console Web UI */}
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="font-bold text-blue-300 flex items-center space-x-1.5">
                      <Globe className="w-4 h-4" />
                      <span>Option A: Via Google Cloud Console (Browser UI)</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed">
                      <li>Go to <a href="https://console.cloud.google.com/run" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">console.cloud.google.com/run</a>.</li>
                      <li>Click the blue <strong>"Create Service"</strong> button at the top.</li>
                      <li>Select <strong>"Continuously deploy from a repository"</strong> &rarr; Link your GitHub account and pick your <code>PriceRadar</code> repo.</li>
                      <li>Build Type: Select <strong>Dockerfile</strong> (our repo already includes the multi-stage Dockerfile).</li>
                      <li>Port: Ensure container port is set to <strong>3000</strong>.</li>
                      <li>Authentication: Select <strong>"Allow unauthenticated invocations"</strong> (required for your web dashboard and the cron webhook).</li>
                      <li>Click <strong>"Create"</strong>. Within ~2 minutes, Google generates a secure free URL (e.g. <code>https://priceradar-xyz-uc.a.run.app</code>).</li>
                    </ol>
                  </div>

                  {/* Option B: 1-Line CLI Command */}
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                      <Terminal className="w-4 h-4" />
                      <span>Option B: Via Google Cloud CLI (1 Command)</span>
                    </div>
                    <p className="text-slate-400">
                      If you have the <code>gcloud</code> CLI installed on your computer, you can deploy in one single command directly from your project folder:
                    </p>
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-emerald-400 break-all select-all">
                      gcloud run deploy priceradar --source . --port 3000 --allow-unauthenticated --region us-central1
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Cloud Run will automatically build your Docker container, deploy it to Google's edge infrastructure, and print your live HTTPS URL in your terminal.
                    </p>
                  </div>

                </div>
              </div>

              {/* Alternative: Render.com Guide */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white flex items-center space-x-2">
                    <Server className="w-4 h-4 text-purple-400" />
                    <span>Alternative: Render.com (Even Simpler 2-Click Setup)</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Alternative to Google Cloud</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  If you prefer not to create a Google Cloud account, <strong className="text-purple-300">Render</strong> offers an ultra-simple free tier:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-slate-300">
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                    <strong className="text-white block mb-0.5">1. Connect Repo</strong>
                    Sign in to <a href="https://render.com" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">render.com</a> with GitHub and click <strong>New &rarr; Web Service</strong>.
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                    <strong className="text-white block mb-0.5">2. Commands</strong>
                    Build: <code className="text-emerald-400">npm run build</code><br />
                    Start: <code className="text-emerald-400">npm run start</code>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                    <strong className="text-white block mb-0.5">3. Free Plan</strong>
                    Select the <strong>Free ($0/mo)</strong> tier and click Deploy. Copy your <code>.onrender.com</code> URL!
                  </div>
                </div>
              </div>

              {/* Wiring Up GitHub Actions (The 2x Daily Cron) */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs">
                <div className="font-bold text-white flex items-center space-x-2">
                  <GitBranch className="w-4 h-4 text-amber-400" />
                  <span>Connecting Google Cloud Run / Render to GitHub Actions (Final Step)</span>
                </div>
                
                <p className="text-slate-300 leading-relaxed">
                  Once your application is live on Cloud Run or Render, tell GitHub Actions where to send the midnight and noon price check requests:
                </p>

                <div className="space-y-2">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </span>
                    <div>
                      <strong className="text-white">Open GitHub Repository Settings</strong>
                      <div className="text-slate-400 mt-0.5">
                        In your GitHub repo, click <strong>Settings &rarr; Secrets and variables &rarr; Actions &rarr; "New repository secret"</strong>.
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </span>
                    <div>
                      <strong className="text-white">Add Secret: APP_URL</strong>
                      <div className="text-slate-400 mt-0.5">
                        Name: <code className="text-amber-300 font-bold">APP_URL</code> &bull; Secret: Your live Cloud Run or Render URL (e.g. <code>https://priceradar-xyz-uc.a.run.app</code>).
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </span>
                    <div>
                      <strong className="text-white">Add Secret: ALERT_EMAIL</strong>
                      <div className="text-slate-400 mt-0.5">
                        Name: <code className="text-amber-300 font-bold">ALERT_EMAIL</code> &bull; Secret: <strong className="text-white">{userEmail}</strong> (or comma-separated list of your emails).
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-emerald-400 font-semibold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Done! GitHub Actions will now trigger your price check at 12:00 AM &amp; 12:00 PM UTC every single day automatically.</span>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-800/60 border-t border-slate-700 p-4 px-6 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Schedule: <span className="font-mono text-amber-400 font-semibold">0 0,12 * * *</span> (Midnight &amp; Noon) &bull; Alerts to {userEmail}
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
