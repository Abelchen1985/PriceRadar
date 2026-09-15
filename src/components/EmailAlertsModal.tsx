import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bell, 
  Mail, 
  Send, 
  CheckCircle2, 
  Flame, 
  Clock, 
  Inbox, 
  Plus, 
  Trash2, 
  Star, 
  Users, 
  Filter, 
  Tag, 
  ExternalLink,
  Check,
  AlertCircle,
  Copy
} from 'lucide-react';
import { TrackedItem, AlertLog, EmailRecipient } from '../types';

interface EmailAlertsModalProps {
  userEmail: string;
  onUpdateEmail: (email: string) => void;
  recipients: EmailRecipient[];
  onAddRecipient: (email: string, label: string) => void;
  onDeleteRecipient: (id: string) => void;
  onSetDefaultRecipient: (id: string) => void;
  items: TrackedItem[];
  onUpdateItemAlertEmails: (itemId: string, emails: string[]) => void;
  alertLogs: AlertLog[];
  onSendAlert: (item: TrackedItem, emails: string | string[]) => Promise<any>;
  onClose: () => void;
}

export const EmailAlertsModal: React.FC<EmailAlertsModalProps> = ({
  userEmail,
  onUpdateEmail,
  recipients,
  onAddRecipient,
  onDeleteRecipient,
  onSetDefaultRecipient,
  items,
  onUpdateItemAlertEmails,
  alertLogs,
  onSendAlert,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'recipients' | 'item-routing' | 'test-dispatcher' | 'logs'>('recipients');
  
  // New recipient form
  const [newEmail, setNewEmail] = useState('');
  const [newLabel, setNewLabel] = useState('Personal');
  const [addSuccess, setAddSuccess] = useState(false);

  // Test dispatcher state
  const [selectedItemForTest, setSelectedItemForTest] = useState(items[0]?.id || '');
  const [selectedRecipientForTest, setSelectedRecipientForTest] = useState<string>('all');
  const [customTestEmail, setCustomTestEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [previewAlert, setPreviewAlert] = useState<any | null>(null);
  const [lastDispatchInfo, setLastDispatchInfo] = useState<{ mode: string; provider: string; message: string } | null>(null);
  const [emailStatus, setEmailStatus] = useState<{
    configured: boolean;
    provider: string;
    resend: boolean;
    smtp: boolean;
    instructions: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    fetch('/api/email-status')
      .then(res => res.json())
      .then(data => setEmailStatus(data))
      .catch(() => {});
  }, []);

  const getGmailComposeUrl = (alert: any) => {
    if (!alert) return '#';
    const targetEmail = alert.email || userEmail;
    const subject = `🔥 Deal Alert: ${alert.itemTitle} dropped to $${Number(alert.newPrice).toFixed(2)} on ${alert.retailer}!`;
    const body = `Hi,\n\nAn item on your PriceRadar watchlist reached a deal price!\n\nProduct: ${alert.itemTitle}\nDeal Price: $${Number(alert.newPrice).toFixed(2)} (MSRP: $${Number(alert.oldPrice).toFixed(2)})\nRetailer: ${alert.retailer}\nStore Link: ${alert.retailerUrl}\n\nHistorical Status: ${alert.isAllTimeLow ? 'Historic All-Time Lowest Price!' : `${alert.dropPercent}% off MSRP`}\n\nTracked via PriceRadar`;
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Log filter
  const [filterLogEmail, setFilterLogEmail] = useState<string>('all');

  const handleAddNewRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.includes('@')) return;
    
    onAddRecipient(newEmail.trim().toLowerCase(), newLabel.trim() || 'Other');
    setNewEmail('');
    setNewLabel('Personal');
    setAddSuccess(true);
    setTimeout(() => setAddSuccess(false), 2500);
  };

  const handleTriggerTest = async () => {
    const item = items.find(it => it.id === selectedItemForTest) || items[0];
    if (!item) return;

    let targetEmails: string[] = [];
    if (selectedRecipientForTest === 'all') {
      targetEmails = recipients.map(r => r.email);
    } else if (selectedRecipientForTest === 'custom') {
      if (!customTestEmail.includes('@')) return;
      targetEmails = [customTestEmail.trim()];
    } else {
      targetEmails = [selectedRecipientForTest];
    }

    if (targetEmails.length === 0) targetEmails = [userEmail];

    setIsSending(true);
    try {
      const res = await onSendAlert(item, targetEmails);
      if (res && res.alert) {
        setPreviewAlert(res.alert);
        if (res.deliveryMode || res.provider) {
          setLastDispatchInfo({
            mode: res.deliveryMode || 'simulated_hub',
            provider: res.provider || 'Simulator',
            message: res.message || 'Alert dispatched successfully'
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // Helper to toggle an email recipient for an item
  const handleToggleItemRecipient = (itemId: string, email: string) => {
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    const currentEmails = item.alertEmails && item.alertEmails.length > 0 
      ? [...item.alertEmails] 
      : [item.userEmail || userEmail];

    let updated: string[];
    if (currentEmails.includes(email)) {
      updated = currentEmails.filter(e => e !== email);
      if (updated.length === 0) {
        // Keep at least default
        updated = [userEmail];
      }
    } else {
      updated = [...currentEmails, email];
    }

    onUpdateItemAlertEmails(itemId, updated);
  };

  // Filter logs
  const filteredLogs = filterLogEmail === 'all' 
    ? alertLogs 
    : alertLogs.filter(log => log.email.toLowerCase() === filterLogEmail.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div 
        id="email-alerts-dialog"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="bg-slate-800/90 border-b border-slate-700 p-5 sm:p-6 flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  Multi-Recipient Notification Hub
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {recipients.length} Active Inbox{recipients.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-1">
                Email Price Drop Alerts &amp; Multi-Inbox Routing
              </h2>
            </div>
          </div>

          <button 
            id="close-alerts-modal"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-950/80 border-b border-slate-800 px-6 pt-3 flex space-x-4 overflow-x-auto text-xs font-bold">
          <button
            id="tab-recipients-btn"
            onClick={() => setActiveTab('recipients')}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'recipients'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Manage Inboxes ({recipients.length})</span>
          </button>

          <button
            id="tab-routing-btn"
            onClick={() => setActiveTab('item-routing')}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'item-routing'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Item-by-Item Email Routing</span>
          </button>

          <button
            id="tab-dispatcher-btn"
            onClick={() => setActiveTab('test-dispatcher')}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'test-dispatcher'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Send Test Alert</span>
          </button>

          <button
            id="tab-logs-btn"
            onClick={() => setActiveTab('logs')}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'logs'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Dispatch History ({alertLogs.length})</span>
          </button>
        </div>

        {/* Tab 1: Manage Inboxes / Recipients */}
        {activeTab === 'recipients' && (
          <div className="p-6 space-y-6">
            {/* Add New Email Recipient Card */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Add New Email Address</span>
              </h3>
              
              <form onSubmit={handleAddNewRecipient} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input 
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="e.g. work@company.com or family@gmail.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Label / Category
                  </label>
                  <select
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="Personal">Personal</option>
                    <option value="Work">Work / Office</option>
                    <option value="Family">Family / Partner</option>
                    <option value="Deals">Deal Alerts</option>
                    <option value="Secondary">Secondary</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition shadow-md flex items-center justify-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Inbox</span>
                  </button>
                </div>
              </form>

              {addSuccess && (
                <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center space-x-1.5 animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Email recipient added successfully!</span>
                </div>
              )}
            </div>

            {/* List of Configured Recipients */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Configured Alert Inboxes ({recipients.length})
                </h3>
                <span className="text-[11px] text-slate-400">
                  Each product can alert one, multiple, or all inboxes
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recipients.map((rec) => {
                  const itemsCount = items.filter(it => 
                    (it.alertEmails && it.alertEmails.includes(rec.email)) || 
                    (!it.alertEmails && it.userEmail === rec.email)
                  ).length;

                  return (
                    <div 
                      key={rec.id}
                      className={`p-4 rounded-xl border transition flex items-start justify-between ${
                        rec.isDefault 
                          ? 'bg-amber-950/20 border-amber-500/40' 
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                            {rec.label}
                          </span>
                          {rec.isDefault && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                              <Star className="w-2.5 h-2.5 fill-amber-300" />
                              <span>Primary Default</span>
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-mono font-semibold text-white truncate">
                          {rec.email}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-1">
                          Monitoring <strong className="text-slate-200">{itemsCount}</strong> tracked product{itemsCount !== 1 ? 's' : ''}
                        </div>
                      </div>

                      <div className="flex flex-col items-end space-y-1.5 shrink-0">
                        {!rec.isDefault && (
                          <button
                            onClick={() => onSetDefaultRecipient(rec.id)}
                            className="text-[11px] text-slate-400 hover:text-amber-300 hover:underline font-medium"
                          >
                            Set as Primary
                          </button>
                        )}
                        {recipients.length > 1 && (
                          <button
                            onClick={() => onDeleteRecipient(rec.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Delete recipient"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Item-by-Item Email Routing Matrix */}
        {activeTab === 'item-routing' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Route Individual Products to Different Inboxes
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select which email address(es) should be alerted whenever an item drops in price.
                </p>
              </div>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {items.map((item) => {
                const assignedEmails = item.alertEmails && item.alertEmails.length > 0 
                  ? item.alertEmails 
                  : [item.userEmail || userEmail];

                return (
                  <div 
                    key={item.id}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                        <span className="text-amber-400 font-semibold">${item.targetPrice.toFixed(2)} Target</span>
                        <span>&bull;</span>
                        <span>{item.category}</span>
                      </div>
                    </div>

                    {/* Email Checkboxes / Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {recipients.map((rec) => {
                        const isAssigned = assignedEmails.includes(rec.email);
                        return (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => handleToggleItemRecipient(item.id, rec.email)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center space-x-1 transition cursor-pointer ${
                              isAssigned
                                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                            title={`Toggle alerts for ${rec.email}`}
                          >
                            <span className="w-2 h-2 rounded-full mr-0.5 inline-block bg-current" />
                            <span>{rec.label}</span>
                            {isAssigned && <Check className="w-3 h-3 ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Send Live Test Alert */}
        {activeTab === 'test-dispatcher' && (
          <div className="p-6 space-y-6">
            {/* Outbound Delivery Status Banner */}
            <div className={`p-4 rounded-xl border flex items-start space-x-3 text-xs ${
              (emailStatus?.smtpDiag?.verified || emailStatus?.resend)
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
            }`}>
              {(emailStatus?.smtpDiag?.verified || emailStatus?.resend) ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 w-full">
                <div className="font-bold flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span>Outbound Dispatch Engine:</span>
                    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                      (emailStatus?.smtpDiag?.verified || emailStatus?.resend)
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {emailStatus?.smtpDiag?.verified 
                        ? `🟢 Gmail SMTP Connected (${emailStatus?.smtpUser || userEmail})` 
                        : emailStatus?.resend 
                        ? '🟢 Resend API Connected'
                        : '🟡 Action Needed for Gmail SMTP'}
                    </span>
                  </div>
                </div>

                {emailStatus?.smtpDiag?.error ? (
                  <div className="mt-1 p-2.5 bg-amber-950/60 rounded-lg border border-amber-500/30 text-[11px] text-amber-200">
                    <p className="font-bold mb-1">Google SMTP Authentication Notice:</p>
                    <p className="text-slate-300">{emailStatus.smtpDiag.error}</p>
                    <p className="mt-1.5 text-[10px] text-amber-300 font-medium">
                      💡 Quick fix: Enable 2-Step Verification on your Google Account, visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-bold text-amber-200 hover:text-white">myaccount.google.com/apppasswords</a>, generate a 16-character App Password for "Mail", and update <code className="bg-slate-900 px-1 py-0.5 rounded">SMTP_PASS</code> in Settings &gt; Secrets.
                    </p>
                  </div>
                ) : emailStatus?.smtpDiag?.verified ? (
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Live Gmail SMTP is connected and verified! Triggering a test alert will dispatch an email directly through your Gmail account to <strong className="text-white">{userEmail}</strong>.
                  </p>
                ) : (
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    To deliver live alerts directly into your Gmail inbox, configure your Google App Password for <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-200">{userEmail}</code> in Settings &gt; Secrets. You can also use the 1-Click "Open in Gmail" button below to preview and send immediately.
                  </p>
                )}
              </div>
            </div>

            {/* Test Form */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                <Send className="w-4 h-4 text-amber-400" />
                <span>Trigger Live Price Drop Alert Test</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Select Product to Alert
                  </label>
                  <select
                    value={selectedItemForTest}
                    onChange={(e) => setSelectedItemForTest(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-xl text-xs font-medium focus:outline-none focus:border-amber-500"
                  >
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.title} (${Math.min(...it.retailers.map(r => r.price)).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Target Recipient Inbox
                  </label>
                  <select
                    value={selectedRecipientForTest}
                    onChange={(e) => setSelectedRecipientForTest(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-xl text-xs font-medium focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">⚡ All Inboxes ({recipients.length} recipients)</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.email}>
                        {r.label} ({r.email})
                      </option>
                    ))}
                    <option value="custom">✏️ Enter Custom One-Off Email...</option>
                  </select>
                </div>
              </div>

              {selectedRecipientForTest === 'custom' && (
                <div className="animate-in fade-in">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    One-Off Custom Email
                  </label>
                  <input
                    type="email"
                    value={customTestEmail}
                    onChange={(e) => setCustomTestEmail(e.target.value)}
                    placeholder="one-off-recipient@example.com"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-[11px] text-slate-400">
                  Target: <strong className="text-amber-300 font-mono">
                    {selectedRecipientForTest === 'all' 
                      ? `${recipients.length} configured inboxes` 
                      : selectedRecipientForTest === 'custom' 
                        ? (customTestEmail || 'Custom email') 
                        : selectedRecipientForTest}
                  </strong>
                </span>

                <button
                  onClick={handleTriggerTest}
                  disabled={isSending}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-bold text-xs sm:text-sm rounded-xl transition shadow-md flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Send className={`w-4 h-4 ${isSending ? 'animate-pulse' : ''}`} />
                  <span>{isSending ? 'Dispatching...' : 'Dispatch Live Test Alert'}</span>
                </button>
              </div>

              {lastDispatchInfo && (
                <div className="p-3 bg-slate-900 border border-slate-700/80 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>{lastDispatchInfo.message}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                    {lastDispatchInfo.provider}
                  </span>
                </div>
              )}
            </div>

            {/* Live Email Inbox Preview */}
            {previewAlert && (
              <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 animate-in fade-in duration-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    <Inbox className="w-4 h-4" />
                    <span>Generated Alert for {previewAlert.email}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* 1-Click Gmail Opener */}
                    <a
                      href={getGmailComposeUrl(previewAlert)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                      title="Open pre-filled deal alert directly in Gmail"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Open in Gmail (1-Click Test)</span>
                      <ExternalLink className="w-3 h-3 ml-0.5" />
                    </a>

                    <button
                      onClick={() => setPreviewAlert(null)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-1"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 text-slate-900 shadow-xl max-h-96 overflow-y-auto border border-slate-200">
                  <div 
                    dangerouslySetInnerHTML={{ __html: previewAlert.emailHtml }} 
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Dispatch Logs */}
        {activeTab === 'logs' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>Alert Dispatch History ({filteredLogs.length})</span>
              </h3>

              {/* Filter by recipient */}
              <div className="flex items-center space-x-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={filterLogEmail}
                  onChange={(e) => setFilterLogEmail(e.target.value)}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-700 text-white rounded-lg text-xs"
                >
                  <option value="all">All Inboxes</option>
                  {recipients.map((r) => (
                    <option key={r.id} value={r.email}>{r.label} ({r.email})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No alerts have been dispatched to this inbox yet.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div 
                    key={log.id}
                    className="p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-xl flex items-center justify-between transition text-xs"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">
                          {log.itemTitle}
                        </div>
                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 mt-0.5">
                          <span className="text-amber-300 font-mono">To: {log.email}</span>
                          <span>&bull;</span>
                          <span className="text-slate-300 font-semibold">${log.newPrice.toFixed(2)} on {log.retailer}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-3">
                      <div className="text-[11px] text-slate-500">{log.timestamp}</div>
                      <button
                        onClick={() => {
                          setPreviewAlert(log);
                          setActiveTab('test-dispatcher');
                        }}
                        className="text-[11px] text-blue-400 hover:underline font-medium"
                      >
                        View Email
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-800/60 border-t border-slate-700 p-4 px-6 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Primary email for sweeps: <strong className="text-amber-300 font-mono">{userEmail}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs transition cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
