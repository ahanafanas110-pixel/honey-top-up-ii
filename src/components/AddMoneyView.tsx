import React, { useState } from 'react';
import {
  ShieldCheck,
  Clock,
  Copy,
  Check,
  ArrowLeft,
  Zap,
  Lock,
  Headphones,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { DepositRequest, PaymentMethod, SiteConfig, UserProfile } from '../types.ts';

interface AddMoneyViewProps {
  user: UserProfile | null;
  siteConfig: SiteConfig;
  deposits: DepositRequest[];
  onRequireAuth: () => void;
  onDepositSubmitted: (dep: DepositRequest) => void;
}

const METHODS: { id: PaymentMethod; name: string; accent: string; bg: string }[] = [
  { id: 'bkash', name: 'bKash', accent: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800' },
  { id: 'nagad', name: 'Nagad', accent: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800' },
  { id: 'rocket', name: 'Rocket', accent: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800' },
  { id: 'upay', name: 'Upay', accent: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800' },
];

export function AddMoneyView({
  user,
  siteConfig,
  deposits,
  onRequireAuth,
  onDepositSubmitted,
}: AddMoneyViewProps) {
  const [step, setStep] = useState<'amount' | 'gateway'>('amount');
  const [amount, setAmount] = useState('300');
  const [method, setMethod] = useState<PaymentMethod>('nagad');
  const [senderPhone, setSenderPhone] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const parsedAmount = Number(amount);
  const adminNumber = siteConfig.paymentNumbers[method] || '01800000000';

  const handleProceed = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 10 || parsedAmount > 500000) {
      setError('Enter an amount between ৳10 and ৳500,000.');
      return;
    }
    setStep('gateway');
  };

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(adminNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleVerifyDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!user) {
      onRequireAuth();
      return;
    }
    if (transactionId.trim().length < 4) {
      setError('Please enter a valid Transaction ID.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ deposit: DepositRequest }>('/api/deposits', {
        method: 'POST',
        body: JSON.stringify({
          amount: parsedAmount,
          method,
          senderPhone: senderPhone.trim() || user.phone,
          transactionId: transactionId.trim(),
        }),
      });
      onDepositSubmitted(res.deposit);
      setSuccessMsg(
        `Deposit request for ৳${res.deposit.amount} submitted! Processing takes 2–4 hours or instant once approved by Admin.`
      );
      setTransactionId('');
      setSenderPhone('');
      setStep('amount');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit deposit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Gateway Hero Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-sm">
        {step === 'amount' ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Instant &amp; Secure Payment Gateway
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
                  Add Money to {siteConfig.siteName}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Fast, protected wallet recharge. Deposits process in 2–4 hours or instantly upon admin approval.
                </p>
              </div>
              {user && (
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Wallet</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    ৳{user.walletBalance}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleProceed} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                  Enter Amount (BDT)
                </label>
                <div className="flex items-center rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 h-14 focus-within:ring-2 focus-within:ring-emerald-500">
                  <span className="text-xl font-bold text-slate-500 dark:text-slate-400 mr-2">৳</span>
                  <input
                    type="number"
                    min={10}
                    max={500000}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount (min 10)"
                    className="w-full bg-transparent text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {['100', '300', '500', '1000', '2000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(preset)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold font-mono tabular-nums transition-colors cursor-pointer ${
                        amount === preset
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      ৳{preset}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors cursor-pointer"
              >
                {user ? 'Proceed to Secure Gateway' : 'Login / Register to Add Money'}
              </button>
            </form>

            <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">Instant</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">On Approval</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">Protected</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Verified TrxID</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <Headphones className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">2–4 Hours</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Auto Queue</div>
              </div>
            </div>
          </>
        ) : (
          /* HoneyPay Secure Gateway Step */
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('amount')}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white min-h-[44px] px-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                HoneyPay Secure Checkout
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Payable Amount</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  ৳{parsedAmount.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Processing Window</div>
                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  2–4 hrs / Instant Admin Approve
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Select Mobile Banking Method
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`h-12 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                      method === m.id
                        ? `${m.bg} ${m.accent} ring-2 ring-emerald-500/40`
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin Number & Instructions Box */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-600 to-rose-700 text-white space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-rose-100">Official {method.toUpperCase()} Number</div>
                  <div className="text-xl font-bold font-mono tabular-nums tracking-wide mt-0.5">
                    {adminNumber}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyNumber}
                  className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-xs text-rose-100 leading-relaxed pt-2 border-t border-white/15">
                {siteConfig.paymentInstructions}
              </div>
            </div>

            <form onSubmit={handleVerifyDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Your Sender Number (Optional)
                </label>
                <input
                  type="tel"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder={user?.phone || '01XXXXXXXXX'}
                  className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Transaction ID (TrxID)
                </label>
                <input
                  type="text"
                  required
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. BL94K28XM1"
                  className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Submitting Deposit...' : 'Verify & Submit Deposit'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* User's Deposit History */}
      {user && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            Recent Deposit Requests
          </h2>
          {deposits.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No deposit requests yet. Submit your first wallet top-up above.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {deposits.map((d) => (
                <div key={d.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                      ৳{d.amount} · {d.method.toUpperCase()}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      TrxID: {d.transactionId} · {new Date(d.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                    {d.status === 'approved' && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" /> Approved
                      </span>
                    )}
                    {d.status === 'pending' && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Clock className="w-4 h-4" /> Pending (2–4h)
                      </span>
                    )}
                    {d.status === 'rejected' && (
                      <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <XCircle className="w-4 h-4" /> Rejected
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
