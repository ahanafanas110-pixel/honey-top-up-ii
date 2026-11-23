import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Home,
  ShoppingBag,
  Plus,
  Ticket,
  User as UserIcon,
  Bell,
  Send,
  Users,
  Copy,
  Check,
  X,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from './lib/api.ts';
import {
  testFirestoreConnection,
  subscribePublicFirestoreSiteConfig,
  subscribePublicFirestorePackages,
} from './lib/firebase.ts';
import { AmbientBeesLayer, HoneycombHiveWidget } from './components/BeeSwarmOverlay.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { AddMoneyView } from './components/AddMoneyView.tsx';
import { AccountView } from './components/AccountView.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import type {
  AnalyticsData,
  DepositRequest,
  NotificationItem,
  OrderItem,
  PackageItem,
  SiteConfig,
  UserProfile,
  WalletTransaction,
} from './types.ts';

type AppRoute = 'home' | 'orders' | 'add-money' | 'codes' | 'account' | 'admin';

function resolveRouteFromPath(pathname: string): AppRoute {
  const clean = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (clean === '/admin-honey-top-up') return 'admin';
  if (clean === '/orders') return 'orders';
  if (clean === '/add-money') return 'add-money';
  if (clean === '/codes') return 'codes';
  if (clean === '/account') return 'account';
  return 'home';
}

function routeToPath(route: AppRoute): string {
  if (route === 'admin') return '/admin-honey-top-up';
  if (route === 'home') return '/';
  return `/${route}`;
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    resolveRouteFromPath(window.location.pathname)
  );
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [liveToast, setLiveToast] = useState<{ title: string; message: string } | null>(null);

  // Banner & Category state
  const [bannerIndex, setBannerIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Order Checkout Modal
  const [selectedPkg, setSelectedPkg] = useState<PackageItem | null>(null);
  const [playerIdInput, setPlayerIdInput] = useState('');
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    const targetPath = routeToPath(nextRoute);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Apply global Light / Dark theme from Admin CMS to <html>
  useEffect(() => {
    const mode = siteConfig?.themeMode || 'light';
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [siteConfig?.themeMode]);

  const fetchUserPrivateData = useCallback(async () => {
    try {
      const me = await apiRequest<{
        user: UserProfile;
        orders: OrderItem[];
        deposits: DepositRequest[];
        notifications: NotificationItem[];
        transactions: WalletTransaction[];
      }>('/api/auth/me');
      setUser(me.user);
      setOrders(me.orders);
      setDeposits(me.deposits);
      setNotifications(me.notifications);
      setTransactions(me.transactions);
    } catch {
      // Not logged in
    }
  }, []);

  // Initial Bootstrap + Firebase Firestore connection check + Live SSE
  useEffect(() => {
    testFirestoreConnection().catch(() => {});

    apiRequest<{
      siteConfig: SiteConfig;
      packages: PackageItem[];
      analytics: AnalyticsData;
      user: UserProfile | null;
    }>('/api/bootstrap', { authMode: 'user' })
      .then((res) => {
        setSiteConfig(res.siteConfig);
        setPackages(res.packages);
        if (res.user) {
          setUser(res.user);
          fetchUserPrivateData();
        }
      })
      .catch(() => {});

    const unsubCfg = subscribePublicFirestoreSiteConfig((partial) => {
      setSiteConfig((prev) => (prev ? { ...prev, ...partial } : prev));
    });
    const unsubPkgs = subscribePublicFirestorePackages(() => {});

    return () => {
      unsubCfg();
      unsubPkgs();
    };
  }, [fetchUserPrivateData]);

  // Real-Time Server-Sent Events (Theme, Banners, Notice, Packages, Wallet, Notifications)
  useEffect(() => {
    const es = new EventSource('/api/events');

    es.addEventListener('public_update', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          siteConfig: SiteConfig;
          packages: PackageItem[];
        };
        if (payload.siteConfig) setSiteConfig(payload.siteConfig);
        if (Array.isArray(payload.packages)) {
          setPackages(payload.packages.filter((p) => p.isActive));
        }
      } catch {
        // ignore malformed SSE
      }
    });

    es.addEventListener('user_update', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          userId: string;
          user: UserProfile;
        };
        setUser((curr) => (curr && curr.id === payload.userId ? payload.user : curr));
        fetchUserPrivateData();
      } catch {
        // ignore
      }
    });

    es.addEventListener('deposit_update', () => {
      fetchUserPrivateData();
    });

    es.addEventListener('order_update', () => {
      fetchUserPrivateData();
    });

    es.addEventListener('notification', (evt) => {
      try {
        const notif = JSON.parse((evt as MessageEvent).data) as NotificationItem;
        setUser((currUser) => {
          if (currUser && notif.targetRole === 'user' && notif.userId === currUser.id) {
            setNotifications((prev) => [notif, ...prev]);
            setLiveToast({ title: notif.title, message: notif.message });
            setTimeout(() => setLiveToast(null), 5000);
          }
          return currUser;
        });
      } catch {
        // ignore
      }
    });

    return () => es.close();
  }, [fetchUserPrivateData]);

  // Visitor Enter / Heartbeat / Exit Tracking
  useEffect(() => {
    const visitorId =
      sessionStorage.getItem('honey_vid') ||
      `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('honey_vid', visitorId);

    apiRequest('/api/analytics/visit', {
      method: 'POST',
      authMode: 'none',
      body: JSON.stringify({ visitorId }),
    }).catch(() => {});

    const hb = setInterval(() => {
      apiRequest('/api/analytics/heartbeat', {
        method: 'POST',
        authMode: 'none',
        body: JSON.stringify({ visitorId }),
      }).catch(() => {});
    }, 20000);

    const handleLeave = () => {
      const blob = new Blob([JSON.stringify({ visitorId })], {
        type: 'application/json',
      });
      navigator.sendBeacon('/api/analytics/leave', blob);
    };

    window.addEventListener('beforeunload', handleLeave);
    return () => {
      clearInterval(hb);
      window.removeEventListener('beforeunload', handleLeave);
    };
  }, []);

  // Auto-rotate promotional banners
  useEffect(() => {
    const count = siteConfig?.banners?.length || 0;
    if (count <= 1) return;
    const id = setInterval(() => {
      setBannerIndex((i) => (i + 1) % count);
    }, 5000);
    return () => clearInterval(id);
  }, [siteConfig?.banners?.length]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(packages.map((p) => p.category)));
    return ['All', ...cats];
  }, [packages]);

  const visiblePackages = useMemo(() => {
    if (selectedCategory === 'All') return packages;
    return packages.filter((p) => p.category === selectedCategory);
  }, [packages, selectedCategory]);

  const unreadNotifsCount = notifications.filter((n) => !n.isRead).length;

  const handleOpenAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPkg) return;
    if (!user) {
      setSelectedPkg(null);
      handleOpenAuth('login');
      return;
    }
    setOrderError('');
    setOrderBusy(true);
    try {
      const res = await apiRequest<{ order: OrderItem; user: UserProfile }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          packageId: selectedPkg.id,
          playerId: playerIdInput.trim(),
        }),
      });
      setUser(res.user);
      setOrders((prev) => [res.order, ...prev]);
      setSelectedPkg(null);
      setPlayerIdInput('');
      setLiveToast({
        title: 'Order Placed!',
        message: `${res.order.packageTitle} for ${res.order.playerId} (${res.order.status})`,
      });
      setTimeout(() => setLiveToast(null), 5000);
      fetchUserPrivateData();
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Order failed.');
    } finally {
      setOrderBusy(false);
    }
  };

  const handleCopyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setOrders([]);
    setDeposits([]);
    setNotifications([]);
    setTransactions([]);
    navigate('home');
  };

  if (route === 'admin') {
    return (
      <AdminDashboard
        onBackHome={() => navigate('home')}
        onSiteUpdated={(cfg, pkgs) => {
          setSiteConfig(cfg);
          setPackages(pkgs);
        }}
      />
    );
  }

  const config: SiteConfig = siteConfig || {
    siteName: 'HONEY TOP UP',
    logoUrl: '/src/assets/images/honey_topup_logo_1795444651885.jpg',
    themeMode: 'light',
    noticeText: 'Welcome to HONEY TOP UP!',
    banners: [],
    paymentNumbers: { bkash: '', nagad: '', rocket: '', upay: '' },
    paymentInstructions: '',
    telegramSupportUrl: 'https://t.me',
    telegramGroupUrl: 'https://t.me',
    supportHours: 'সকাল ৮টা থেকে রাত ১২টা',
    updatedAt: '',
  };

  const banners = config.banners || [];
  const activeBanner = banners[bannerIndex % Math.max(1, banners.length)];

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 pb-20 md:pb-8 transition-colors duration-200">
      {/* Realistic Animated Flying Bees */}
      <AmbientBeesLayer />

      {/* Top Navigation Bar (Clean 3-Zone Contract, 56px height) */}
      <header className="sticky top-0 z-40 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Logo & Wordmark */}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <img
              src={config.logoUrl}
              alt={config.siteName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover border border-amber-300 dark:border-amber-700"
            />
            <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              {config.siteName}
            </span>
          </button>

          {/* Zone 2: Desktop Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            {[
              { id: 'home', label: 'Home' },
              { id: 'orders', label: 'My Orders' },
              { id: 'add-money', label: 'Add Money' },
              { id: 'codes', label: 'My Codes' },
              { id: 'account', label: 'My Account' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id as AppRoute)}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  route === item.id
                    ? 'text-emerald-600 dark:text-amber-400 font-semibold'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Wallet / Notifications / Account Action */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('add-money')}
                  className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono tabular-nums flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  ৳{user.walletBalance.toLocaleString()}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifDrawerOpen(!notifDrawerOpen);
                    if (unreadNotifsCount > 0) {
                      apiRequest('/api/notifications/read', { method: 'POST' })
                        .then(() =>
                          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
                        )
                        .catch(() => {});
                    }
                  }}
                  aria-label="Notifications"
                  className="relative w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotifsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadNotifsCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('account')}
                  aria-label="My Account"
                  className="w-9 h-9 rounded-full overflow-hidden border border-amber-400 bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenAuth('login')}
                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Login / Register
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Real-Time Toast Notification */}
      {liveToast && (
        <div className="fixed top-16 right-4 z-50 max-w-xs w-full rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-amber-400/40 p-3.5 shadow-xl flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold">{liveToast.title}</div>
            <div className="text-[11px] text-slate-300 mt-0.5">{liveToast.message}</div>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-slate-400 hover:text-white"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notifications Drawer */}
      {notifDrawerOpen && user && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 h-full p-5 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold">Real-Time Notifications</h2>
              <button
                type="button"
                onClick={() => setNotifDrawerOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 mt-2">
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  No transaction notifications yet.
                </p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="py-3.5">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{n.title}</div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</p>
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 space-y-6 relative z-10">
        {route === 'home' && (
          <>
            {/* Scrolling Notice Ticker */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 h-11 flex items-center overflow-hidden shadow-xs">
              <div className="px-3.5 h-full bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shrink-0">
                <Megaphone className="w-3.5 h-3.5" />
                NOTICE
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="animate-marquee text-xs font-medium text-slate-700 dark:text-slate-200 px-4">
                  <span className="mr-16">{config.noticeText}</span>
                  <span className="mr-16">{config.noticeText}</span>
                </div>
              </div>
            </div>

            {/* Hero Promotional Banner Slider */}
            {banners.length > 0 && activeBanner && (
              <section className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 aspect-[16/9] sm:aspect-[21/9] shadow-sm">
                <img
                  src={activeBanner.imageUrl}
                  alt={activeBanner.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex flex-col justify-end p-5 sm:p-8">
                  <h1 className="text-xl sm:text-3xl font-bold text-white max-w-2xl text-balance">
                    {activeBanner.title}
                  </h1>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (activeBanner.link === '/add-money') {
                          navigate('add-money');
                        } else {
                          document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Explore Packages
                    </button>
                    {!user && (
                      <button
                        type="button"
                        onClick={() => handleOpenAuth('register')}
                        className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Create Account (+88)
                      </button>
                    )}
                  </div>
                </div>

                {banners.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setBannerIndex((i) => (i - 1 + banners.length) % banners.length)
                      }
                      aria-label="Previous banner"
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/65 cursor-pointer"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerIndex((i) => (i + 1) % banners.length)}
                      aria-label="Next banner"
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/65 cursor-pointer"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </section>
            )}

            {/* Interactive Honeycomb Hive (মধুর চাক) + Support Links Row */}
            <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <HoneycombHiveWidget />

              <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
                <a
                  href={config.telegramSupportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-12 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-sky-400 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 transition-colors"
                >
                  <Send className="w-4 h-4 text-sky-500" />
                  Support Telegram
                </a>
                <a
                  href={config.telegramGroupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-12 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 transition-colors"
                >
                  <Users className="w-4 h-4 text-emerald-500" />
                  Join Group
                </a>
              </div>
            </section>

            {/* Packages Catalog Grid */}
            <section id="packages" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {config.siteName} Entertainment Packages
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select any package below for instant delivery via your wallet.
                  </p>
                </div>

                {/* Category Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {visiblePackages.length === 0 ? (
                <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
                  No active packages in this category yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
                  {visiblePackages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => {
                        setSelectedPkg(pkg);
                        setOrderError('');
                      }}
                      className="group text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col cursor-pointer"
                    >
                      <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <img
                          src={pkg.imageUrl}
                          alt={pkg.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/75 text-white text-[10px] font-semibold">
                          {pkg.deliveryLabel}
                        </div>
                      </div>
                      <div className="p-3.5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {pkg.category}
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 line-clamp-1">
                            {pkg.title}
                          </h3>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                            ৳{pkg.price.toLocaleString()}
                          </span>
                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                            Top Up →
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Support Footer Card */}
            <footer className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center space-y-3">
              <div className="flex items-center justify-center gap-2">
                <img
                  src={config.logoUrl}
                  alt={config.siteName}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-lg object-cover"
                />
                <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                  {config.siteName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                HelpLine Open: {config.supportHours} · Secure BD Mobile Wallet Deposits &amp; Instant Top-Up Delivery.
              </p>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                © {new Date().getFullYear()} {config.siteName}. All Rights Reserved.
              </div>
            </footer>
          </>
        )}

        {route === 'orders' && (
          <div className="max-w-3xl mx-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7">
            <h1 className="text-xl font-bold mb-4">My Orders</h1>
            {!user ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 mb-4">
                  Sign in to view your order history.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAuth('login')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                >
                  Login / Register
                </button>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 mb-4">No orders placed yet.</p>
                <button
                  type="button"
                  onClick={() => navigate('home')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                >
                  Order Now
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map((ord) => (
                  <div key={ord.id} className="py-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {ord.packageTitle}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        Player ID: {ord.playerId} · {new Date(ord.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        ৳{ord.amount}
                      </div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500 mt-0.5">
                        {ord.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {route === 'codes' && (
          <div className="max-w-3xl mx-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7">
            <h1 className="text-xl font-bold mb-4">My Codes &amp; Vouchers</h1>
            {!user ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 mb-4">
                  Sign in to view your delivered voucher codes.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAuth('login')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                >
                  Login / Register
                </button>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 mb-4">No code data found yet.</p>
                <button
                  type="button"
                  onClick={() => navigate('home')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                >
                  Order Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-500">{ord.packageTitle}</div>
                      <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                        {ord.voucherCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(ord.id, ord.voucherCode)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedCodeId === ord.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {route === 'add-money' && (
          <AddMoneyView
            user={user}
            siteConfig={config}
            deposits={deposits}
            onRequireAuth={() => handleOpenAuth('login')}
            onDepositSubmitted={(dep) => {
              setDeposits((prev) => [dep, ...prev]);
              fetchUserPrivateData();
            }}
          />
        )}

        {route === 'account' && (
          <AccountView
            user={user}
            siteConfig={config}
            transactions={transactions}
            onRequireAuth={() => handleOpenAuth('login')}
            onUserUpdated={(updated) => setUser(updated)}
            onGoAddMoney={() => navigate('add-money')}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Fixed 64px height, total sticky <= 15% mobile height) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1">
        <button
          type="button"
          onClick={() => navigate('home')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
            route === 'home'
              ? 'text-emerald-600 dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          Home
        </button>

        <button
          type="button"
          onClick={() => navigate('orders')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
            route === 'orders'
              ? 'text-emerald-600 dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ShoppingBag className="w-5 h-5 mb-0.5" />
          My Orders
        </button>

        <button
          type="button"
          onClick={() => navigate('add-money')}
          className="flex flex-col items-center justify-center -mt-4"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center border-4 border-white dark:border-slate-900">
            <Plus className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            Add Money
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('codes')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
            route === 'codes'
              ? 'text-emerald-600 dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Ticket className="w-5 h-5 mb-0.5" />
          My Codes
        </button>

        <button
          type="button"
          onClick={() => navigate('account')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
            route === 'account'
              ? 'text-emerald-600 dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <UserIcon className="w-5 h-5 mb-0.5" />
          My Account
        </button>
      </nav>

      {/* Package Checkout Modal */}
      {selectedPkg && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={selectedPkg.imageUrl}
                  alt={selectedPkg.title}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-2xl object-cover"
                />
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedPkg.category}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {selectedPkg.title}
                  </h3>
                  <div className="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    ৳{selectedPkg.price.toLocaleString()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPkg(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedPkg.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                {selectedPkg.description}
              </p>
            )}

            <form onSubmit={handlePlaceOrder} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Player UID / Entertainment Account ID
                </label>
                <input
                  type="text"
                  required
                  value={playerIdInput}
                  onChange={(e) => setPlayerIdInput(e.target.value)}
                  placeholder="Enter your UID or Account ID"
                  className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {user && (
                <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                  <span className="text-slate-500 dark:text-slate-400">Your Wallet Balance</span>
                  <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    ৳{user.walletBalance.toLocaleString()}
                  </span>
                </div>
              )}

              {orderError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
                  {orderError}
                </div>
              )}

              <div className="flex gap-2.5">
                {user && user.walletBalance < selectedPkg.price ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPkg(null);
                      navigate('add-money');
                    }}
                    className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
                  >
                    Insufficient Balance — Add Money Now
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={orderBusy}
                    className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 cursor-pointer"
                  >
                    {user
                      ? orderBusy
                        ? 'Processing Order...'
                        : `Confirm Top-Up (৳${selectedPkg.price})`
                      : 'Login / Register to Order'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          fetchUserPrivateData();
        }}
      />
    </div>
  );
}
