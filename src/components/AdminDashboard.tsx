import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  Lock,
  Users,
  Wallet,
  Package as PackageIcon,
  ShoppingBag,
  BarChart3,
  Settings,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  Trash2,
  Upload,
  Sun,
  Moon,
  Bell,
  KeyRound,
  LogOut,
  ArrowLeft,
  Cloud,
} from 'lucide-react';
import { apiRequest, compressImageFromGallery, setAdminToken } from '../lib/api.ts';
import {
  signInWithGoogleForCloudSync,
  syncPackageToFirestore,
  syncSiteConfigToFirestore,
  watchFirebaseAuth,
} from '../lib/firebase.ts';
import type {
  AnalyticsData,
  BannerItem,
  DepositRequest,
  NotificationItem,
  OrderItem,
  OrderStatus,
  PackageItem,
  SiteConfig,
  UserProfile,
} from '../types.ts';

interface AdminDashboardProps {
  onBackHome: () => void;
  onSiteUpdated: (config: SiteConfig, packages: PackageItem[], analytics: AnalyticsData) => void;
}

type AdminTab = 'analytics' | 'deposits' | 'users' | 'packages' | 'orders' | 'cms';

interface AdminPayload {
  siteConfig: SiteConfig;
  packages: PackageItem[];
  users: UserProfile[];
  deposits: DepositRequest[];
  orders: OrderItem[];
  notifications: NotificationItem[];
  analytics: AnalyticsData;
  blockedIpCount: number;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function AdminDashboard({ onBackHome, onSiteUpdated }: AdminDashboardProps) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [blockedUntil, setBlockedUntil] = useState<number>(0);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [authenticated, setAuthenticated] = useState(false);

  // Login Gate
  const [adminNumber, setAdminNumber] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // Dashboard Data
  const [tab, setTab] = useState<AdminTab>('analytics');
  const [data, setData] = useState<AdminPayload | null>(null);
  const [toast, setToast] = useState('');
  const [firebaseEmail, setFirebaseEmail] = useState<string | null>(null);

  // Wallet & Password Modals
  const [walletModalUser, setWalletModalUser] = useState<UserProfile | null>(null);
  const [walletAction, setWalletAction] = useState<'add' | 'cut'>('add');
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('');

  const [passwordModalUser, setPasswordModalUser] = useState<UserProfile | null>(null);
  const [newUserPass, setNewUserPass] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // New Package Form
  const [pkgTitle, setPkgTitle] = useState('');
  const [pkgCategory, setPkgCategory] = useState('Game Top-Up');
  const [pkgPrice, setPkgPrice] = useState('');
  const [pkgDelivery, setPkgDelivery] = useState('Auto Delivery');
  const [pkgDesc, setPkgDesc] = useState('');
  const [pkgImage, setPkgImage] = useState('/src/assets/images/pkg_diamond_pack_1795444652233.jpg');
  const pkgFileRef = useRef<HTMLInputElement | null>(null);

  // CMS Form State
  const [cmsConfig, setCmsConfig] = useState<SiteConfig | null>(null);
  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const [newBannerTitle, setNewBannerTitle] = useState('');
  const [newBannerLink, setNewBannerLink] = useState('#packages');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const payload = await apiRequest<AdminPayload>('/api/admin/dashboard', {
        authMode: 'admin',
      });
      setData(payload);
      setCmsConfig(payload.siteConfig);
      onSiteUpdated(
        payload.siteConfig,
        payload.packages.filter((p) => p.isActive),
        payload.analytics
      );
    } catch (err) {
      const e = err as Error & { blocked?: boolean; blockedUntil?: number; status?: number };
      if (e.blocked && e.blockedUntil) {
        setBlockedUntil(e.blockedUntil);
        setAuthenticated(false);
      } else if (e.status === 401) {
        setAuthenticated(false);
      }
    }
  }, [onSiteUpdated]);

  useEffect(() => {
    const unsub = watchFirebaseAuth((fbUser) => {
      setFirebaseEmail(fbUser?.email || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<{
          blocked: boolean;
          blockedUntil?: number;
          authenticated: boolean;
        }>('/api/admin/status', { authMode: 'admin' });
        if (!active) return;
        if (res.blocked && res.blockedUntil) {
          setBlockedUntil(res.blockedUntil);
          setAuthenticated(false);
        } else {
          setAuthenticated(res.authenticated);
          if (res.authenticated) {
            await fetchDashboard();
          }
        }
      } catch (err) {
        const e = err as Error & { blocked?: boolean; blockedUntil?: number };
        if (e.blocked && e.blockedUntil) {
          setBlockedUntil(e.blockedUntil);
        }
      } finally {
        if (active) setStatusLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchDashboard]);

  // Countdown timer when IP is blocked
  useEffect(() => {
    if (!blockedUntil) return;
    const tick = () => {
      const rem = blockedUntil - Date.now();
      setRemainingMs(rem);
      if (rem <= 0) {
        setBlockedUntil(0);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [blockedUntil]);

  // Auto-refresh analytics & notifications while logged in
  useEffect(() => {
    if (!authenticated) return;
    const id = setInterval(() => {
      fetchDashboard();
    }, 6000);
    return () => clearInterval(id);
  }, [authenticated, fetchDashboard]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginBusy(true);
    try {
      const res = await apiRequest<{ authenticated: boolean; token: string }>('/api/admin/login', {
        method: 'POST',
        authMode: 'none',
        body: JSON.stringify({ number: adminNumber.trim(), password: adminPassword }),
      });
      setAdminToken(res.token);
      setAuthenticated(true);
      await fetchDashboard();
    } catch (err) {
      const e = err as Error & { blocked?: boolean; blockedUntil?: number };
      if (e.blocked && e.blockedUntil) {
        setBlockedUntil(e.blockedUntil);
      }
      setLoginError(e.message || 'Invalid admin credentials.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleAdminLogout = async () => {
    await apiRequest('/api/admin/logout', { method: 'POST', authMode: 'admin' }).catch(() => {});
    setAdminToken(null);
    setAuthenticated(false);
    onBackHome();
  };

  const handleDepositDecision = async (depId: string, decision: 'approve' | 'reject') => {
    try {
      await apiRequest(`/api/admin/deposits/${depId}/decision`, {
        method: 'POST',
        authMode: 'admin',
        body: JSON.stringify({ decision }),
      });
      showToast(decision === 'approve' ? 'Deposit approved & wallet credited!' : 'Deposit rejected.');
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleWalletAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletModalUser) return;
    const amt = Number(walletAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    try {
      await apiRequest(`/api/admin/users/${walletModalUser.id}/balance`, {
        method: 'POST',
        authMode: 'admin',
        body: JSON.stringify({
          action: walletAction,
          amount: amt,
          reason: walletReason.trim(),
        }),
      });
      showToast(
        `${walletAction === 'add' ? 'Added' : 'Deducted'} ৳${amt} for ${walletModalUser.name}`
      );
      setWalletModalUser(null);
      setWalletAmount('');
      setWalletReason('');
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Balance adjustment failed.');
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser || newUserPass.length < 6) return;
    try {
      await apiRequest(`/api/admin/users/${passwordModalUser.id}/password`, {
        method: 'POST',
        authMode: 'admin',
        body: JSON.stringify({ newPassword: newUserPass }),
      });
      showToast(`Password updated for ${passwordModalUser.name}`);
      setPasswordModalUser(null);
      setNewUserPass('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Password update failed.');
    }
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ package: PackageItem }>('/api/admin/packages', {
        method: 'POST',
        authMode: 'admin',
        body: JSON.stringify({
          title: pkgTitle.trim(),
          category: pkgCategory.trim(),
          price: Number(pkgPrice),
          deliveryLabel: pkgDelivery.trim(),
          description: pkgDesc.trim(),
          imageUrl: pkgImage,
        }),
      });
      if (firebaseEmail) {
        syncPackageToFirestore(res.package).catch(() => {});
      }
      showToast(`Package "${res.package.title}" created!`);
      setPkgTitle('');
      setPkgPrice('');
      setPkgDesc('');
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create package.');
    }
  };

  const handleTogglePackage = async (pkg: PackageItem) => {
    try {
      await apiRequest(`/api/admin/packages/${pkg.id}`, {
        method: 'PUT',
        authMode: 'admin',
        body: JSON.stringify({ isActive: !pkg.isActive }),
      });
      await fetchDashboard();
    } catch {
      // ignore
    }
  };

  const handleDeletePackage = async (pkgId: string) => {
    try {
      await apiRequest(`/api/admin/packages/${pkgId}`, {
        method: 'DELETE',
        authMode: 'admin',
      });
      showToast('Package removed.');
      await fetchDashboard();
    } catch {
      // ignore
    }
  };

  const handleOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await apiRequest(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        authMode: 'admin',
        body: JSON.stringify({ status }),
      });
      showToast(`Order marked ${status}.`);
      await fetchDashboard();
    } catch {
      // ignore
    }
  };

  const handleSaveCms = async (overrideConfig?: SiteConfig) => {
    const target = overrideConfig || cmsConfig;
    if (!target) return;
    try {
      const res = await apiRequest<{ siteConfig: SiteConfig }>('/api/admin/config', {
        method: 'PUT',
        authMode: 'admin',
        body: JSON.stringify(target),
      });
      setCmsConfig(res.siteConfig);
      if (firebaseEmail) {
        syncSiteConfigToFirestore(res.siteConfig).catch(() => {});
      }
      showToast('Site changes saved & synced live to all devices!');
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save configuration.');
    }
  };

  const handleGalleryLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cmsConfig) return;
    try {
      const dataUrl = await compressImageFromGallery(file, 360, 0.82);
      const updated = { ...cmsConfig, logoUrl: dataUrl };
      setCmsConfig(updated);
      await handleSaveCms(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Logo upload failed.');
    } finally {
      e.target.value = '';
    }
  };

  const handleGalleryBannerAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cmsConfig) return;
    try {
      const dataUrl = await compressImageFromGallery(file, 960, 0.78);
      const newBanner: BannerItem = {
        id: `banner_${Date.now()}`,
        title: newBannerTitle.trim() || 'Promotional Offer',
        imageUrl: dataUrl,
        link: newBannerLink.trim() || '#packages',
      };
      const updated = { ...cmsConfig, banners: [...cmsConfig.banners, newBanner] };
      setCmsConfig(updated);
      setNewBannerTitle('');
      await handleSaveCms(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Banner upload failed.');
    } finally {
      e.target.value = '';
    }
  };

  const handleGalleryPackageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFromGallery(file, 640, 0.8);
      setPkgImage(dataUrl);
      showToast('Package image selected from gallery!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      e.target.value = '';
    }
  };

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Verifying admin access...
        </div>
      </div>
    );
  }

  // 2-Hour IP Lockout Screen (Strictly hides admin login & dashboard)
  if (blockedUntil > Date.now()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-rose-800/70 p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-700/60 text-rose-400 flex items-center justify-center mx-auto mb-5">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-white">Admin Access Temporarily Blocked</h1>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            Invalid administrator credentials were entered from your IP address. For security, the
            admin panel is hidden and restricted from this IP for 2 hours.
          </p>
          <div className="mt-6 p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400">Time Remaining</div>
            <div className="text-3xl font-bold font-mono tabular-nums text-rose-400 mt-1">
              {formatCountdown(remainingMs)}
            </div>
          </div>
          <button
            type="button"
            onClick={onBackHome}
            className="mt-6 w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white transition-colors cursor-pointer"
          >
            Return to Storefront
          </button>
        </div>
      </div>
    );
  }

  // Admin Login Gate
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 shadow-lg">
          <button
            type="button"
            onClick={onBackHome}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white mb-5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to HONEY TOP UP
          </button>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            HONEY TOP UP Admin Gate
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enter authorized admin number and password. Incorrect credentials immediately lock your IP for 2 hours.
          </p>

          <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Admin Number
              </label>
              <input
                type="text"
                required
                value={adminNumber}
                onChange={(e) => setAdminNumber(e.target.value)}
                placeholder="Enter admin number"
                className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Admin Password
              </label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginBusy}
              className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loginBusy ? 'Verifying...' : 'Unlock Admin Panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const pendingDepositsCount = data?.deposits.filter((d) => d.status === 'pending').length || 0;
  const filteredUsers =
    data?.users.filter(
      (u) =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.phone.includes(userSearch) ||
        u.shortId.includes(userSearch)
    ) || [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Admin Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackHome}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              aria-label="Back to storefront"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-base font-bold truncate">HONEY TOP UP Admin</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Live Sync Control Center
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!cmsConfig) return;
                const nextMode = cmsConfig.themeMode === 'dark' ? 'light' : 'dark';
                const updated = { ...cmsConfig, themeMode: nextMode } as SiteConfig;
                setCmsConfig(updated);
                handleSaveCms(updated);
              }}
              className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {cmsConfig?.themeMode === 'dark' ? (
                <>
                  <Moon className="w-4 h-4 text-amber-400" />
                  <span>Global: Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>Global: Light</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleAdminLogout}
              className="h-10 px-3.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Exit Admin</span>
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-bold shadow-xl">
          {toast}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'deposits', label: `Deposits (${pendingDepositsCount})`, icon: Wallet },
            { id: 'users', label: `Users (${data?.users.length || 0})`, icon: Users },
            { id: 'packages', label: `Packages (${data?.packages.length || 0})`, icon: PackageIcon },
            { id: 'orders', label: `Orders (${data?.orders.length || 0})`, icon: ShoppingBag },
            { id: 'cms', label: 'Site CMS & Theme', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as AdminTab)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* TAB 1: ANALYTICS & VISITORS */}
        {tab === 'analytics' && data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Active Online', val: data.analytics.activeVisitors, tone: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Total Entered', val: data.analytics.totalVisits, tone: 'text-slate-900 dark:text-white' },
                { label: 'Total Exited', val: data.analytics.totalExits, tone: 'text-slate-600 dark:text-slate-300' },
                { label: 'Registered', val: data.analytics.totalRegistrations, tone: 'text-amber-600 dark:text-amber-400' },
                { label: 'Total Logins', val: data.analytics.totalLogins, tone: 'text-sky-600 dark:text-sky-400' },
                { label: 'Total Orders', val: data.analytics.totalOrders, tone: 'text-purple-600 dark:text-purple-400' },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4"
                >
                  <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
                  <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${kpi.tone}`}>
                    {kpi.val}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold">Live Visitor &amp; Activity Stream</h2>
                  <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    Revenue: ৳{data.analytics.totalRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {data.analytics.recentEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">Waiting for site activity...</p>
                  ) : (
                    data.analytics.recentEvents.map((ev) => (
                      <div key={ev.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <span className="font-semibold uppercase text-amber-600 dark:text-amber-400 mr-2">
                            {ev.type}
                          </span>
                          <span className="text-slate-700 dark:text-slate-300">{ev.label}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                          {new Date(ev.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-500" />
                    Admin Transaction Alerts
                  </h2>
                  <button
                    type="button"
                    onClick={() => apiRequest('/api/admin/notifications/read', { method: 'POST', authMode: 'admin' }).then(fetchDashboard)}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {data.notifications.length === 0 ? (
                    <p className="text-sm text-slate-500">No admin notifications yet.</p>
                  ) : (
                    data.notifications.slice(0, 20).map((n) => (
                      <div key={n.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {n.title}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(n.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {n.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEPOSITS */}
        {tab === 'deposits' && data && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-4">Deposit Requests Queue</h2>
            {data.deposits.length === 0 ? (
              <p className="text-sm text-slate-500">No deposit submissions yet.</p>
            ) : (
              <div className="space-y-3">
                {data.deposits.map((dep) => (
                  <div
                    key={dep.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          ৳{dep.amount}
                        </span>
                        <span className="text-xs font-bold uppercase text-amber-600 dark:text-amber-400">
                          {dep.method}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {dep.userName} ({dep.userPhone}) · ID #{dep.userShortId}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-1">
                        TrxID: <strong>{dep.transactionId}</strong> · Sender: {dep.senderPhone} ·{' '}
                        {new Date(dep.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {dep.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDepositDecision(dep.id, 'approve')}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Approve &amp; Add ৳{dep.amount}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDepositDecision(dep.id, 'reject')}
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-bold uppercase ${
                            dep.status === 'approved'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {dep.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: USERS & WALLET CONTROL */}
        {tab === 'users' && data && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Registered Accounts &amp; Wallet Control</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add/cut money for any user ID, inspect Support PINs, or set/reset account passwords.
                </p>
              </div>
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name, phone, or #ID..."
                className="h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs w-full sm:w-64"
              />
            </div>

            {filteredUsers.length === 0 ? (
              <p className="text-sm text-slate-500">No registered users found.</p>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0 font-bold text-amber-800 dark:text-amber-300">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt={u.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          u.name.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {u.name}{' '}
                          <span className="font-mono text-xs text-slate-500">#{u.shortId}</span>
                        </div>
                        <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                          {u.phone} · PIN: <strong>{u.supportPin}</strong> · Password: Encrypted (Resettable)
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Rank: {u.rank} · Orders: {u.ordersCount} · Total Spend: ৳{u.totalSpend}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        ৳{u.walletBalance.toLocaleString()}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setWalletModalUser(u);
                          setWalletAction('add');
                        }}
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add ৳
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWalletModalUser(u);
                          setWalletAction('cut');
                        }}
                        className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" /> Cut ৳
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordModalUser(u);
                          setNewUserPass('');
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Set Password
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PACKAGES BUILDER */}
        {tab === 'packages' && data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
              <h2 className="text-base font-bold mb-4">Create New Package</h2>
              <form onSubmit={handleCreatePackage} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">Package Title</label>
                  <input
                    type="text"
                    required
                    value={pkgTitle}
                    onChange={(e) => setPkgTitle(e.target.value)}
                    placeholder="e.g. 520 Diamonds Pack"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Category</label>
                    <input
                      type="text"
                      required
                      value={pkgCategory}
                      onChange={(e) => setPkgCategory(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Price (৳)</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={pkgPrice}
                      onChange={(e) => setPkgPrice(e.target.value)}
                      placeholder="150"
                      className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Delivery Tag</label>
                  <input
                    type="text"
                    value={pkgDelivery}
                    onChange={(e) => setPkgDelivery(e.target.value)}
                    placeholder="Auto Delivery"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={pkgDesc}
                    onChange={(e) => setPkgDesc(e.target.value)}
                    placeholder="Short package details..."
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Package Image (From Gallery)
                  </label>
                  <div className="flex items-center gap-3">
                    <img
                      src={pkgImage}
                      alt="Package preview"
                      referrerPolicy="no-referrer"
                      className="w-16 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => pkgFileRef.current?.click()}
                      className="flex-1 h-11 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      Choose from Gallery
                    </button>
                    <input
                      ref={pkgFileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleGalleryPackageUpload}
                      className="hidden"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm cursor-pointer"
                >
                  Publish Package
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
              <h2 className="text-base font-bold mb-4">Active &amp; Draft Packages</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3"
                  >
                    <img
                      src={pkg.imageUrl}
                      alt={pkg.title}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{pkg.title}</div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        ৳{pkg.price} · {pkg.category}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePackage(pkg)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                            pkg.isActive
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {pkg.isActive ? 'Active' : 'Hidden'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePackage(pkg.id)}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          aria-label="Delete package"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ORDERS MANAGER */}
        {tab === 'orders' && data && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
            <h2 className="text-lg font-bold mb-4">All Customer Orders</h2>
            {data.orders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders placed yet.</p>
            ) : (
              <div className="space-y-3">
                {data.orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-bold">
                        {ord.packageTitle}{' '}
                        <span className="font-mono text-emerald-600 dark:text-emerald-400">
                          ৳{ord.amount}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        Customer: {ord.userName} ({ord.userPhone}) · Player UID: <strong>{ord.playerId}</strong> · Code: {ord.voucherCode}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(['pending', 'completed', 'cancelled'] as OrderStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleOrderStatus(ord.id, st)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                            ord.status === st
                              ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: SITE CMS & GLOBAL THEME */}
        {tab === 'cms' && cmsConfig && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
              <h2 className="text-base font-bold">Brand, Global Theme &amp; Notice</h2>

              {/* Global Light/Dark Mode Selector */}
              <div>
                <label className="block text-xs font-semibold mb-2">
                  Global Site Theme (Applies to ALL visitors in real time)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const updated: SiteConfig = { ...cmsConfig, themeMode: 'light' };
                      setCmsConfig(updated);
                      handleSaveCms(updated);
                    }}
                    className={`h-12 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                      cmsConfig.themeMode === 'light'
                        ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-400/40'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Sun className="w-4 h-4" /> Light Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated: SiteConfig = { ...cmsConfig, themeMode: 'dark' };
                      setCmsConfig(updated);
                      handleSaveCms(updated);
                    }}
                    className={`h-12 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                      cmsConfig.themeMode === 'dark'
                        ? 'bg-slate-800 border-amber-400 text-amber-300 ring-2 ring-amber-400/40'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Moon className="w-4 h-4" /> Dark Mode
                  </button>
                </div>
              </div>

              {/* Site Name & Logo Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Platform Name</label>
                  <input
                    type="text"
                    value={cmsConfig.siteName}
                    onChange={(e) => setCmsConfig({ ...cmsConfig, siteName: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <img
                    src={cmsConfig.logoUrl}
                    alt="Logo"
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => logoFileRef.current?.click()}
                    className="flex-1 h-11 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" /> Change Logo
                  </button>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryLogoUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Scrolling Notice */}
              <div>
                <label className="block text-xs font-semibold mb-1.5">Scrolling Notice Text</label>
                <textarea
                  rows={2}
                  value={cmsConfig.noticeText}
                  onChange={(e) => setCmsConfig({ ...cmsConfig, noticeText: e.target.value })}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              {/* Payment Gateway Numbers */}
              <div>
                <label className="block text-xs font-semibold mb-2">
                  Admin Payment Receiving Numbers
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(['bkash', 'nagad', 'rocket', 'upay'] as const).map((m) => (
                    <div key={m}>
                      <span className="text-[11px] uppercase font-bold text-slate-500">{m}</span>
                      <input
                        type="text"
                        value={cmsConfig.paymentNumbers[m]}
                        onChange={(e) =>
                          setCmsConfig({
                            ...cmsConfig,
                            paymentNumbers: {
                              ...cmsConfig.paymentNumbers,
                              [m]: e.target.value,
                            },
                          })
                        }
                        className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono mt-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSaveCms()}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm cursor-pointer"
              >
                Save &amp; Sync All Changes Live
              </button>
            </div>

            {/* Banners & Firebase Cloud Sync */}
            <div className="space-y-6">
              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <h2 className="text-base font-bold">Promotional Banners (Gallery Upload)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={newBannerTitle}
                    onChange={(e) => setNewBannerTitle(e.target.value)}
                    placeholder="Banner title"
                    className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => bannerFileRef.current?.click()}
                    className="h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" /> Upload Banner from Gallery
                  </button>
                  <input
                    ref={bannerFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryBannerAdd}
                    className="hidden"
                  />
                </div>

                <div className="space-y-2.5">
                  {cmsConfig.banners.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={b.imageUrl}
                          alt={b.title}
                          referrerPolicy="no-referrer"
                          className="w-20 h-12 rounded-xl object-cover shrink-0"
                        />
                        <div className="text-xs font-semibold truncate">{b.title}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...cmsConfig,
                            banners: cmsConfig.banners.filter((item) => item.id !== b.id),
                          };
                          setCmsConfig(updated);
                          handleSaveCms(updated);
                        }}
                        className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                        aria-label="Remove banner"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-sky-500" />
                      Firebase Firestore Cloud Sync
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {firebaseEmail
                        ? `Connected as ${firebaseEmail}`
                        : 'Link your Google Admin account to mirror config & packages into Firestore.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await signInWithGoogleForCloudSync();
                        if (cmsConfig) await syncSiteConfigToFirestore(cmsConfig);
                        showToast('Synced live config to Firebase Firestore!');
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : 'Firebase sync cancelled.');
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shrink-0 cursor-pointer"
                  >
                    {firebaseEmail ? 'Push Sync' : 'Connect Google'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Wallet Add/Cut Modal */}
      {walletModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleWalletAdjust}
            className="max-w-sm w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="text-base font-bold">
              {walletAction === 'add' ? 'Add Balance' : 'Cut Balance'} — {walletModalUser.name}
            </h3>
            <div className="text-xs text-slate-500 font-mono">
              Current Balance: ৳{walletModalUser.walletBalance}
            </div>
            <input
              type="number"
              min={1}
              required
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              placeholder="Amount in BDT (৳)"
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono"
            />
            <input
              type="text"
              value={walletReason}
              onChange={(e) => setWalletReason(e.target.value)}
              placeholder="Reason / Note (optional)"
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWalletModalUser(null)}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`flex-1 h-11 rounded-xl text-white text-xs font-bold cursor-pointer ${
                  walletAction === 'add' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                Confirm {walletAction === 'add' ? 'Add' : 'Cut'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Password Reset Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleResetUserPassword}
            className="max-w-sm w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="text-base font-bold">
              Set New Password — {passwordModalUser.name}
            </h3>
            <div className="text-xs text-slate-500 font-mono">
              Phone: {passwordModalUser.phone} · ID #{passwordModalUser.shortId}
            </div>
            <input
              type="text"
              minLength={6}
              required
              value={newUserPass}
              onChange={(e) => setNewUserPass(e.target.value)}
              placeholder="Enter new password (min 6 chars)"
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
