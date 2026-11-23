import React, { useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Shield,
  Award,
  Plus,
  LogOut,
  ShoppingBag,
  TrendingUp,
  Calendar,
  Send,
  Lock,
  User as UserIcon,
} from 'lucide-react';
import { apiRequest, compressImageFromGallery } from '../lib/api.ts';
import type { RankName, SiteConfig, UserProfile, WalletTransaction } from '../types.ts';

interface AccountViewProps {
  user: UserProfile | null;
  siteConfig: SiteConfig;
  transactions: WalletTransaction[];
  onRequireAuth: () => void;
  onUserUpdated: (user: UserProfile) => void;
  onGoAddMoney: () => void;
  onLogout: () => void;
}

const RANKS: { name: RankName; min: number; maxLabel: string }[] = [
  { name: 'Bronze', min: 0, maxLabel: '0 – 100 Tk' },
  { name: 'Silver', min: 101, maxLabel: '101 – 1,000 Tk' },
  { name: 'Gold', min: 1001, maxLabel: '1,001 – 5,000 Tk' },
  { name: 'Platinum', min: 5001, maxLabel: '5,001 – 10,000 Tk' },
  { name: 'Diamond', min: 10001, maxLabel: '10,001 – 25,000 Tk' },
  { name: 'Heroic', min: 25001, maxLabel: '25,001 – 50,000 Tk' },
  { name: 'Master', min: 50001, maxLabel: '50,001 – 100,000 Tk' },
  { name: 'Grand Master', min: 100001, maxLabel: '100,000+ Tk' },
];

export function AccountView({
  user,
  siteConfig,
  transactions,
  onRequireAuth,
  onUserUpdated,
  onGoAddMoney,
  onLogout,
}: AccountViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [statusMsg, setStatusMsg] = useState('');

  if (!user) {
    return (
      <div className="max-w-lg mx-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
          <UserIcon className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Sign In to View Your Account
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
          Register with your +88 11-digit mobile number or log in to manage your wallet, profile photo, and orders.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="mt-6 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors cursor-pointer"
        >
          Login / Register Now
        </button>
      </div>
    );
  }

  const currentRankIndex = Math.max(
    0,
    RANKS.findIndex((r) => r.name === user.rank)
  );
  const nextRank = RANKS[currentRankIndex + 1];
  const progressPct = nextRank
    ? Math.min(100, Math.max(2, Math.round((user.totalSpend / nextRank.min) * 100)))
    : 100;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setStatusMsg('');
    try {
      const compressed = await compressImageFromGallery(file, 320, 0.8);
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: compressed }),
      });
      onUserUpdated(res.user);
      setStatusMsg('Profile photo updated from gallery!');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim().length < 2) return;
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      onUserUpdated(res.user);
      setEditingName(false);
      setStatusMsg('Profile name updated.');
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile & Wallet Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 flex items-center justify-center">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-amber-800 dark:text-amber-300">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload profile photo from gallery"
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md cursor-pointer"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>

            <div>
              {editingName ? (
                <form onSubmit={handleSaveName} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="px-3 h-9 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">{user.name}</h1>
                  <button
                    type="button"
                    onClick={() => {
                      setNameInput(user.name);
                      setEditingName(true);
                    }}
                    className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
              )}
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified Account
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums">Support PIN: {user.supportPin}</span>
                <span>·</span>
                <span className="font-mono tabular-nums">ID #{user.shortId}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                {user.phone}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="self-start sm:self-center px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>

        {statusMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
            {statusMsg}
          </div>
        )}

        {/* Wallet Balance Bar */}
        <div className="mt-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Wallet Balance</div>
            <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              ৳ {user.walletBalance.toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            onClick={onGoAddMoney}
            className="h-12 px-6 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Money
          </button>
        </div>
      </div>

      {/* Rank Card + Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl bg-gradient-to-br from-amber-800 via-amber-900 to-slate-900 text-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-200">
                Level {currentRankIndex + 1} · Current Rank
              </span>
              <Award className="w-6 h-6 text-amber-300" />
            </div>
            <div className="text-2xl font-bold mt-2">{user.rank}</div>
            <p className="text-xs text-amber-100/80 mt-1">
              {nextRank
                ? `Need ৳${Math.max(0, nextRank.min - user.totalSpend).toLocaleString()} more spend to unlock ${nextRank.name}`
                : 'Maximum Grand Master rank unlocked!'}
            </p>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-amber-100 mb-2">
              <span>Total Spend: ৳{user.totalSpend.toLocaleString()}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">Orders</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {user.ordersCount}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">Total Spend</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              ৳{user.totalSpend.toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <Calendar className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">Weekly Spend</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              ৳{user.weeklySpend.toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">Rank</div>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              {user.rank}
            </div>
          </div>
        </div>
      </div>

      {/* Rank Journey + Wallet Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Rank Journey</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {currentRankIndex + 1}/{RANKS.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {RANKS.map((r, idx) => {
              const unlocked = idx <= currentRankIndex;
              const isCurrent = idx === currentRankIndex;
              return (
                <div
                  key={r.name}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs ${
                    isCurrent
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {r.maxLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {unlocked ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {isCurrent ? 'Current' : 'Unlocked'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Lock className="w-3.5 h-3.5" /> Locked
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Wallet Ledger
            </h2>
            {transactions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No wallet activity recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {transactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {tx.note}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(tx.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div
                      className={`text-sm font-bold font-mono tabular-nums shrink-0 ${
                        tx.amount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {tx.amount >= 0 ? `+৳${tx.amount}` : `-৳${Math.abs(tx.amount)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Contact HelpLine</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Support hours: {siteConfig.supportHours}
            </p>
            <a
              href={siteConfig.telegramSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Send className="w-4 h-4" />
              Message Support on Telegram
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
