import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import type {
  AnalyticsData,
  BannerItem,
  DepositRequest,
  NotificationItem,
  OrderItem,
  PackageItem,
  PaymentMethod,
  RankName,
  SiteConfig,
  UserProfile,
  VisitorEvent,
  WalletTransaction,
} from './src/types.ts';

interface StoredUser extends UserProfile {
  passwordSalt: string;
  passwordHash: string;
}

interface StoreState {
  siteConfig: SiteConfig;
  packages: PackageItem[];
  users: StoredUser[];
  deposits: DepositRequest[];
  orders: OrderItem[];
  notifications: NotificationItem[];
  walletTransactions: WalletTransaction[];
  analytics: AnalyticsData;
  ipBlocks: Record<string, number>;
}

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'honey_store.json');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const IP_LOCKOUT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

// Salted scrypt digests for default admin access credentials when env vars are not overridden
const ADMIN_CRED_SALT = 'honey_admin_salt_v1';
const DEFAULT_ADMIN_NUMBER_DIGEST =
  '8c76d9d17a433b2421db62f2b35f7a373827632fdad813dd930af4e6867a50a8';
const DEFAULT_ADMIN_PASS_DIGEST =
  '6cc8fa917ce0cccc6754f2193d5ed61b9c14f781e3f1172569e9c20034667e2f';

function hashWithScrypt(value: string, salt: string): string {
  return crypto.scryptSync(value, salt, 32).toString('hex');
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  const aBuf = Buffer.from(aHex, 'hex');
  const bBuf = Buffer.from(bHex, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyAdminCredentials(inputNumber: string, inputPassword: string): boolean {
  const envNumber = process.env.ADMIN_NUMBER?.trim();
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();

  if (envNumber && envPasscode) {
    const numA = Buffer.from(inputNumber.trim());
    const numB = Buffer.from(envNumber);
    const passA = Buffer.from(inputPassword);
    const passB = Buffer.from(envPasscode);
    const numOk = numA.length === numB.length && crypto.timingSafeEqual(numA, numB);
    const passOk = passA.length === passB.length && crypto.timingSafeEqual(passA, passB);
    return numOk && passOk;
  }

  const numDigest = hashWithScrypt(inputNumber.trim(), ADMIN_CRED_SALT);
  const passDigest = hashWithScrypt(inputPassword, ADMIN_CRED_SALT);
  return (
    timingSafeHexEqual(numDigest, DEFAULT_ADMIN_NUMBER_DIGEST) &&
    timingSafeHexEqual(passDigest, DEFAULT_ADMIN_PASS_DIGEST)
  );
}

function hashUserPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyUserPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return timingSafeHexEqual(actualHash, expectedHash);
}

function calculateRank(totalSpend: number): RankName {
  if (totalSpend >= 100000) return 'Grand Master';
  if (totalSpend >= 50000) return 'Master';
  if (totalSpend >= 25000) return 'Heroic';
  if (totalSpend >= 10000) return 'Diamond';
  if (totalSpend >= 5000) return 'Platinum';
  if (totalSpend >= 1000) return 'Gold';
  if (totalSpend >= 101) return 'Silver';
  return 'Bronze';
}

function nowIso(): string {
  return new Date().toISOString();
}

function createInitialStore(): StoreState {
  const ts = nowIso();
  return {
    siteConfig: {
      siteName: 'HONEY TOP UP',
      logoUrl: '/src/assets/images/honey_topup_logo_1795444651885.jpg',
      themeMode: 'light',
      noticeText:
        'HONEY TOP UP-এ স্বাগতম! যেকোনো ডিপোজিট ২-৪ ঘণ্টার মধ্যে অথবা এডমিন অ্যাপ্রুভ করার সাথে সাথেই আপনার ওয়ালেটে যুক্ত হয়ে যাবে।',
      banners: [
        {
          id: 'banner_1',
          title: 'Golden Honey Entertainment Top-Up',
          imageUrl: '/src/assets/images/banner_honey_event_1795444652090.jpg',
          link: '#packages',
        },
        {
          id: 'banner_2',
          title: 'Secure & Fast Wallet Recharge',
          imageUrl: '/src/assets/images/banner_instant_wallet_1795444650987.jpg',
          link: '/add-money',
        },
      ],
      paymentNumbers: {
        bkash: '01700000000',
        nagad: '01800000000',
        rocket: '01900000000',
        upay: '01600000000',
      },
      paymentInstructions:
        'প্রথমে উপরের নাম্বারে Send Money করুন, তারপর আপনার Transaction ID দিয়ে ভেরিফাই করুন। ২-৪ ঘণ্টার মধ্যে অথবা এডমিন অ্যাপ্রুভ করলে সাথে সাথে ব্যালেন্স যোগ হবে।',
      telegramSupportUrl: 'https://t.me',
      telegramGroupUrl: 'https://t.me',
      supportHours: 'সকাল ৮টা থেকে রাত ১২টা',
      updatedAt: ts,
    },
    packages: [
      {
        id: 'pkg_uid_topup',
        title: 'UID TopUp (BD)',
        category: 'Game Top-Up',
        price: 115,
        deliveryLabel: 'Auto Delivery',
        imageUrl: '/src/assets/images/pkg_diamond_pack_1795444652233.jpg',
        description: 'Instant BD server UID top-up delivered directly to your player ID.',
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'pkg_weekly_monthly',
        title: 'Weekly / Monthly Offer',
        category: 'Membership',
        price: 160,
        deliveryLabel: 'Auto Delivery',
        imageUrl: '/src/assets/images/pkg_vip_pass_1795444650458.jpg',
        description: 'Value membership pack with bonus daily rewards and priority processing.',
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'pkg_honey_vip',
        title: 'Honey VIP Pass',
        category: 'Entertainment',
        price: 250,
        deliveryLabel: 'Instant Pass',
        imageUrl: '/src/assets/images/pkg_vip_pass_1795444650458.jpg',
        description: 'Exclusive entertainment pass with instant digital code activation.',
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'pkg_diamond_mega',
        title: 'Diamond Mega Pack',
        category: 'Game Top-Up',
        price: 540,
        deliveryLabel: 'Auto Delivery',
        imageUrl: '/src/assets/images/pkg_diamond_pack_1795444652233.jpg',
        description: 'High-value diamond bundle for competitive matches and season events.',
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'pkg_level_pass',
        title: 'Level Up Pass',
        category: 'Game Top-Up',
        price: 190,
        deliveryLabel: 'Instant Pass',
        imageUrl: '/src/assets/images/pkg_vip_pass_1795444650458.jpg',
        description: 'Unlock milestone diamond tiers as your account progresses.',
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'pkg_voucher_gift',
        title: 'Unipin & Gift Code',
        category: 'Vouchers',
        price: 320,
        deliveryLabel: 'Instant Code',
        imageUrl: '/src/assets/images/pkg_diamond_pack_1795444652233.jpg',
        description: 'Redeemable gift voucher delivered directly in your My Codes tab.',
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    users: [],
    deposits: [],
    orders: [],
    notifications: [],
    walletTransactions: [],
    analytics: {
      activeVisitors: 0,
      totalVisits: 0,
      totalExits: 0,
      totalRegistrations: 0,
      totalLogins: 0,
      totalOrders: 0,
      totalRevenue: 0,
      recentEvents: [],
      updatedAt: ts,
    },
    ipBlocks: {},
  };
}

function loadStore(): StoreState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial = createInitialStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreState;
    if (!parsed.siteConfig || !Array.isArray(parsed.packages)) {
      return createInitialStore();
    }
    return parsed;
  } catch {
    return createInitialStore();
  }
}

let store: StoreState = loadStore();

function saveStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

// Active visitor heartbeats: visitorId -> { lastSeen, ip }
const activeVisitorsMap = new Map<string, { lastSeen: number; label: string }>();

function pruneActiveVisitors(): boolean {
  const cutoff = Date.now() - 45000;
  let removed = false;
  for (const [vid, info] of activeVisitorsMap.entries()) {
    if (info.lastSeen < cutoff) {
      activeVisitorsMap.delete(vid);
      store.analytics.totalExits += 1;
      pushAnalyticsEvent('exit', `${info.label} left (timeout)`);
      removed = true;
    }
  }
  store.analytics.activeVisitors = activeVisitorsMap.size;
  return removed;
}

function pushAnalyticsEvent(type: VisitorEvent['type'], label: string) {
  const evt: VisitorEvent = {
    id: `evt_${crypto.randomUUID().slice(0, 8)}`,
    type,
    label: label.slice(0, 120),
    createdAt: nowIso(),
  };
  store.analytics.recentEvents = [evt, ...store.analytics.recentEvents].slice(0, 40);
  store.analytics.updatedAt = nowIso();
}

// SSE Clients
interface SseClient {
  id: string;
  res: Response;
  userId?: string;
  isAdmin?: boolean;
}
const sseClients = new Set<SseClient>();

function broadcastEvent(event: string, payload: unknown) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function broadcastPublicState() {
  broadcastEvent('public_update', {
    siteConfig: store.siteConfig,
    packages: store.packages,
    analytics: store.analytics,
  });
}

function addNotification(
  targetRole: 'user' | 'admin',
  title: string,
  message: string,
  type: NotificationItem['type'],
  userId?: string
) {
  const notif: NotificationItem = {
    id: `notif_${crypto.randomUUID().slice(0, 10)}`,
    targetRole,
    userId,
    title: title.slice(0, 100),
    message: message.slice(0, 300),
    type,
    isRead: false,
    createdAt: nowIso(),
  };
  store.notifications = [notif, ...store.notifications].slice(0, 250);
  broadcastEvent('notification', notif);
}

// Signed Token Helpers
interface TokenPayload {
  sub: string;
  role: 'user' | 'admin';
  exp: number;
}

function signToken(payload: TokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      result[key] = val;
    }
  }
  return result;
}

function extractToken(req: Request, kind: 'user' | 'admin'): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req);
  return kind === 'admin' ? cookies.honey_admin_token || null : cookies.honey_user_token || null;
}

function setSessionCookie(req: Request, res: Response, name: string, token: string, maxAgeSec: number) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response, name: string) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof xff === 'string' && xff.trim()) {
    ip = xff.split(',')[0].trim();
  } else if (Array.isArray(xff) && xff[0]) {
    ip = xff[0].trim();
  } else {
    ip = req.ip || req.socket.remoteAddress || 'unknown';
  }
  return ip.replace(/^::ffff:/, '');
}

function checkIpBlocked(ip: string): { blocked: boolean; blockedUntil: number; remainingMs: number } {
  const until = store.ipBlocks[ip];
  if (!until) return { blocked: false, blockedUntil: 0, remainingMs: 0 };
  const now = Date.now();
  if (until <= now) {
    delete store.ipBlocks[ip];
    saveStore();
    return { blocked: false, blockedUntil: 0, remainingMs: 0 };
  }
  return { blocked: true, blockedUntil: until, remainingMs: until - now };
}

function sanitizeUser(u: StoredUser): UserProfile {
  return {
    id: u.id,
    shortId: u.shortId,
    name: u.name,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    walletBalance: u.walletBalance,
    totalSpend: u.totalSpend,
    weeklySpend: u.weeklySpend,
    ordersCount: u.ordersCount,
    rank: u.rank,
    supportPin: u.supportPin,
    isVerified: u.isVerified,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function validateSafeImageUrl(url: unknown, maxLen: number): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.length > maxLen) return null;
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return null;
  }
  return null;
}

function validateSafeLink(url: unknown): string {
  if (typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed.slice(0, 300);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed.slice(0, 300);
    }
  } catch {
    return '#';
  }
  return '#';
}

function verifyMutationCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  // Allow sendBeacon for analytics leave
  if (req.path === '/api/analytics/leave') {
    return next();
  }
  const hasCustomHeader = req.headers['x-requested-with'] === 'XMLHttpRequest';
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let originMatchesHost = false;
  if (typeof origin === 'string' && typeof host === 'string') {
    try {
      originMatchesHost = new URL(origin).host === host;
    } catch {
      originMatchesHost = false;
    }
  }
  if (!hasCustomHeader && !originMatchesHost) {
    return res.status(403).json({ error: 'Forbidden request origin' });
  }
  next();
}

function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req, 'user');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'user') {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const user = store.users.find((u) => u.id === payload.sub);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  (req as Request & { authUser?: StoredUser }).authUser = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const block = checkIpBlocked(ip);
  if (block.blocked) {
    return res.status(403).json({
      blocked: true,
      blockedUntil: block.blockedUntil,
      remainingMs: block.remainingMs,
      error: 'Access locked for 2 hours due to invalid admin credentials.',
    });
  }
  const token = extractToken(req, 'admin');
  if (!token) return res.status(401).json({ error: 'Admin authentication required' });
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }
  next();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', verifyMutationCsrf);

  // Periodic cleanup of stale active visitors
  setInterval(() => {
    if (pruneActiveVisitors()) {
      saveStore();
      broadcastPublicState();
    }
  }, 15000);

  // --- SSE Real-Time Stream ---
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const userToken = extractToken(req, 'user');
    const adminToken = extractToken(req, 'admin');
    const userPayload = userToken ? verifyToken(userToken) : null;
    const adminPayload = adminToken ? verifyToken(adminToken) : null;

    const client: SseClient = {
      id: crypto.randomUUID(),
      res,
      userId: userPayload?.role === 'user' ? userPayload.sub : undefined,
      isAdmin: adminPayload?.role === 'admin',
    };
    sseClients.add(client);

    res.write(
      `event: public_update\ndata: ${JSON.stringify({
        siteConfig: store.siteConfig,
        packages: store.packages,
        analytics: store.analytics,
      })}\n\n`
    );

    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(ping);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(client);
    });
  });

  // --- Public Bootstrap ---
  app.get('/api/bootstrap', (req, res) => {
    const token = extractToken(req, 'user');
    const payload = token ? verifyToken(token) : null;
    const user =
      payload?.role === 'user' ? store.users.find((u) => u.id === payload.sub) : undefined;

    res.json({
      siteConfig: store.siteConfig,
      packages: store.packages.filter((p) => p.isActive),
      analytics: store.analytics,
      user: user ? sanitizeUser(user) : null,
    });
  });

  // --- Live Visitor Tracking ---
  app.post('/api/analytics/visit', (req, res) => {
    const visitorId =
      typeof req.body?.visitorId === 'string' && req.body.visitorId.length <= 64
        ? req.body.visitorId
        : crypto.randomUUID();
    const ip = getClientIp(req);
    const maskedIp = ip.includes('.')
      ? ip.split('.').slice(0, 2).join('.') + '.*.*'
      : 'Visitor';
    const isNew = !activeVisitorsMap.has(visitorId);
    activeVisitorsMap.set(visitorId, { lastSeen: Date.now(), label: maskedIp });

    if (isNew) {
      store.analytics.totalVisits += 1;
      pushAnalyticsEvent('enter', `${maskedIp} entered site`);
    }
    store.analytics.activeVisitors = activeVisitorsMap.size;
    saveStore();
    broadcastPublicState();
    res.json({ visitorId, analytics: store.analytics });
  });

  app.post('/api/analytics/heartbeat', (req, res) => {
    const visitorId = typeof req.body?.visitorId === 'string' ? req.body.visitorId : '';
    if (visitorId) {
      const existing = activeVisitorsMap.get(visitorId);
      activeVisitorsMap.set(visitorId, {
        lastSeen: Date.now(),
        label: existing?.label || 'Visitor',
      });
      store.analytics.activeVisitors = activeVisitorsMap.size;
    }
    res.json({ ok: true });
  });

  app.post('/api/analytics/leave', (req, res) => {
    let visitorId = '';
    if (typeof req.body?.visitorId === 'string') {
      visitorId = req.body.visitorId;
    }
    if (visitorId && activeVisitorsMap.has(visitorId)) {
      const info = activeVisitorsMap.get(visitorId)!;
      activeVisitorsMap.delete(visitorId);
      store.analytics.totalExits += 1;
      store.analytics.activeVisitors = activeVisitorsMap.size;
      pushAnalyticsEvent('exit', `${info.label} exited site`);
      saveStore();
      broadcastPublicState();
    }
    res.json({ ok: true });
  });

  // --- User Auth (+88 11-digit phone + password) ---
  app.post('/api/auth/register', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phoneDigits =
      typeof req.body?.phoneDigits === 'string' ? req.body.phoneDigits.replace(/\D/g, '') : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmPassword =
      typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'Name must be 2 to 80 characters.' });
    }
    if (phoneDigits.length !== 11 || !/^01[3-9]\d{8}$/.test(phoneDigits)) {
      return res.status(400).json({
        error: 'Phone number must be exactly 11 digits starting with 01 (e.g. 017XXXXXXXX).',
      });
    }
    if (password.length < 6 || password.length > 100) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const fullPhone = `+88${phoneDigits}`;
    const existing = store.users.find((u) => u.phone === fullPhone);
    if (existing) {
      return res.status(409).json({ error: 'This phone number is already registered.' });
    }

    const { salt, hash } = hashUserPassword(password);
    const ts = nowIso();
    const shortId = String(1001 + store.users.length);
    const supportPin = String(Math.floor(1000 + Math.random() * 9000));

    const newUser: StoredUser = {
      id: `usr_${crypto.randomUUID().slice(0, 12)}`,
      shortId,
      name,
      phone: fullPhone,
      avatarUrl: '',
      walletBalance: 0,
      totalSpend: 0,
      weeklySpend: 0,
      ordersCount: 0,
      rank: 'Bronze',
      supportPin,
      isVerified: true,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: ts,
      updatedAt: ts,
    };

    store.users.unshift(newUser);
    store.analytics.totalRegistrations += 1;
    store.analytics.totalLogins += 1;
    pushAnalyticsEvent('register', `${name} (${fullPhone}) registered`);
    addNotification(
      'admin',
      'New Member Registered',
      `${name} joined with ${fullPhone} (ID #${shortId})`,
      'system'
    );
    addNotification(
      'user',
      'Welcome to HONEY TOP UP',
      `Your account #${shortId} is active. Add money to start topping up!`,
      'system',
      newUser.id
    );
    saveStore();
    broadcastPublicState();

    const token = signToken({
      sub: newUser.id,
      role: 'user',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    setSessionCookie(req, res, 'honey_user_token', token, 7 * 24 * 60 * 60);
    res.status(201).json({ token, user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const phoneDigits =
      typeof req.body?.phoneDigits === 'string' ? req.body.phoneDigits.replace(/\D/g, '') : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (phoneDigits.length !== 11 || !/^01[3-9]\d{8}$/.test(phoneDigits)) {
      return res.status(400).json({
        error: 'Enter a valid 11-digit BD number (01XXXXXXXXX).',
      });
    }

    const fullPhone = `+88${phoneDigits}`;
    const user = store.users.find((u) => u.phone === fullPhone);
    if (!user || !verifyUserPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({
        error: 'Invalid phone number or password. Only registered accounts can log in.',
      });
    }

    store.analytics.totalLogins += 1;
    pushAnalyticsEvent('login', `${user.name} logged in`);
    saveStore();
    broadcastPublicState();

    const token = signToken({
      sub: user.id,
      role: 'user',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    setSessionCookie(req, res, 'honey_user_token', token, 7 * 24 * 60 * 60);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res, 'honey_user_token');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireUser, (req, res) => {
    const user = (req as Request & { authUser: StoredUser }).authUser;
    const myOrders = store.orders.filter((o) => o.userId === user.id);
    const myDeposits = store.deposits.filter((d) => d.userId === user.id);
    const myNotifs = store.notifications.filter(
      (n) => n.targetRole === 'user' && n.userId === user.id
    );
    const myTransactions = store.walletTransactions.filter((t) => t.userId === user.id);
    res.json({
      user: sanitizeUser(user),
      orders: myOrders,
      deposits: myDeposits,
      notifications: myNotifs,
      transactions: myTransactions,
    });
  });

  app.patch('/api/auth/profile', requireUser, (req, res) => {
    const user = (req as Request & { authUser: StoredUser }).authUser;
    if (typeof req.body?.name === 'string') {
      const n = req.body.name.trim();
      if (n.length < 2 || n.length > 80) {
        return res.status(400).json({ error: 'Name must be 2 to 80 characters.' });
      }
      user.name = n;
    }
    if (req.body?.avatarUrl !== undefined) {
      const validImg = validateSafeImageUrl(req.body.avatarUrl, 200000);
      if (validImg === null) {
        return res.status(400).json({ error: 'Invalid image format or file too large.' });
      }
      user.avatarUrl = validImg;
    }
    user.updatedAt = nowIso();
    saveStore();
    broadcastEvent('user_update', { userId: user.id, user: sanitizeUser(user) });
    res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/notifications/read', requireUser, (req, res) => {
    const user = (req as Request & { authUser: StoredUser }).authUser;
    for (const n of store.notifications) {
      if (n.targetRole === 'user' && n.userId === user.id) {
        n.isRead = true;
      }
    }
    saveStore();
    res.json({ ok: true });
  });

  // --- Deposits (User submits -> Admin approves/rejects) ---
  app.post('/api/deposits', requireUser, (req, res) => {
    const user = (req as Request & { authUser: StoredUser }).authUser;
    const amount = Number(req.body?.amount);
    const method = req.body?.method as PaymentMethod;
    const senderPhone =
      typeof req.body?.senderPhone === 'string' ? req.body.senderPhone.trim().slice(0, 20) : '';
    const transactionId =
      typeof req.body?.transactionId === 'string' ? req.body.transactionId.trim() : '';

    if (!Number.isFinite(amount) || amount < 10 || amount > 500000) {
      return res.status(400).json({ error: 'Deposit amount must be between ৳10 and ৳500,000.' });
    }
    if (!['bkash', 'nagad', 'rocket', 'upay'].includes(method)) {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }
    if (transactionId.length < 4 || transactionId.length > 64) {
      return res.status(400).json({ error: 'Please enter a valid Transaction ID (4-64 chars).' });
    }

    const dup = store.deposits.find(
      (d) => d.transactionId.toLowerCase() === transactionId.toLowerCase() && d.status !== 'rejected'
    );
    if (dup) {
      return res.status(409).json({ error: 'This Transaction ID has already been submitted.' });
    }

    const ts = nowIso();
    const dep: DepositRequest = {
      id: `dep_${crypto.randomUUID().slice(0, 10)}`,
      userId: user.id,
      userShortId: user.shortId,
      userName: user.name,
      userPhone: user.phone,
      amount: Math.round(amount),
      method,
      senderPhone: senderPhone || user.phone,
      transactionId,
      status: 'pending',
      adminNote: '',
      createdAt: ts,
      updatedAt: ts,
    };

    store.deposits.unshift(dep);
    pushAnalyticsEvent('deposit', `${user.name} requested ৳${dep.amount} via ${method.toUpperCase()}`);
    addNotification(
      'admin',
      'New Deposit Request',
      `${user.name} (${user.phone}) submitted ৳${dep.amount} via ${method.toUpperCase()} • TrxID: ${transactionId}`,
      'deposit'
    );
    addNotification(
      'user',
      'Deposit Submitted',
      `Your ৳${dep.amount} ${method.toUpperCase()} deposit is pending. Processing takes 2–4 hours or instant upon admin approval.`,
      'deposit',
      user.id
    );
    saveStore();
    broadcastEvent('deposit_update', dep);
    broadcastPublicState();

    res.status(201).json({ deposit: dep });
  });

  // --- Orders (User purchases package with wallet balance) ---
  app.post('/api/orders', requireUser, (req, res) => {
    const user = (req as Request & { authUser: StoredUser }).authUser;
    const packageId = typeof req.body?.packageId === 'string' ? req.body.packageId : '';
    const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.trim() : '';

    const pkg = store.packages.find((p) => p.id === packageId && p.isActive);
    if (!pkg) return res.status(404).json({ error: 'Package not found.' });
    if (playerId.length < 2 || playerId.length > 64) {
      return res.status(400).json({ error: 'Please enter a valid Player UID / Account ID.' });
    }
    if (user.walletBalance < pkg.price) {
      return res.status(400).json({
        error: `Insufficient wallet balance (৳${user.walletBalance}). Please add money first.`,
      });
    }

    const ts = nowIso();
    user.walletBalance -= pkg.price;
    user.totalSpend += pkg.price;
    user.weeklySpend += pkg.price;
    user.ordersCount += 1;
    user.rank = calculateRank(user.totalSpend);
    user.updatedAt = ts;

    const isInstant = pkg.deliveryLabel.toLowerCase().includes('instant') || pkg.deliveryLabel.toLowerCase().includes('auto');
    const voucherCode = `HNY-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const order: OrderItem = {
      id: `ord_${crypto.randomUUID().slice(0, 10)}`,
      userId: user.id,
      userShortId: user.shortId,
      userName: user.name,
      userPhone: user.phone,
      packageId: pkg.id,
      packageTitle: pkg.title,
      amount: pkg.price,
      playerId,
      voucherCode,
      status: isInstant ? 'completed' : 'pending',
      createdAt: ts,
      updatedAt: ts,
    };

    store.orders.unshift(order);
    store.walletTransactions.unshift({
      id: `tx_${crypto.randomUUID().slice(0, 10)}`,
      userId: user.id,
      type: 'order_debit',
      amount: -pkg.price,
      note: `Ordered ${pkg.title} (UID: ${playerId})`,
      createdAt: ts,
    });

    store.analytics.totalOrders += 1;
    store.analytics.totalRevenue += pkg.price;
    pushAnalyticsEvent('order', `${user.name} ordered ${pkg.title} (৳${pkg.price})`);

    addNotification(
      'admin',
      'New Package Order',
      `${user.name} ordered ${pkg.title} for ৳${pkg.price} (Player ID: ${playerId})`,
      'order'
    );
    addNotification(
      'user',
      'Order Confirmed',
      `${pkg.title} (৳${pkg.price}) for ID ${playerId} is ${order.status}. Code: ${voucherCode}`,
      'order',
      user.id
    );

    saveStore();
    broadcastEvent('user_update', { userId: user.id, user: sanitizeUser(user) });
    broadcastEvent('order_update', order);
    broadcastPublicState();

    res.status(201).json({ order, user: sanitizeUser(user) });
  });

  // --- Admin Gate & 2-Hour IP Lockout ---
  app.get('/api/admin/status', (req, res) => {
    const ip = getClientIp(req);
    const block = checkIpBlocked(ip);
    if (block.blocked) {
      return res.status(403).json({
        blocked: true,
        blockedUntil: block.blockedUntil,
        remainingMs: block.remainingMs,
        authenticated: false,
      });
    }
    const token = extractToken(req, 'admin');
    const payload = token ? verifyToken(token) : null;
    res.json({
      blocked: false,
      authenticated: Boolean(payload && payload.role === 'admin'),
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const ip = getClientIp(req);
    const block = checkIpBlocked(ip);
    if (block.blocked) {
      return res.status(403).json({
        blocked: true,
        blockedUntil: block.blockedUntil,
        remainingMs: block.remainingMs,
        error: 'This IP address is blocked from the admin panel for 2 hours.',
      });
    }

    const number = typeof req.body?.number === 'string' ? req.body.number : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!verifyAdminCredentials(number, password)) {
      const blockedUntil = Date.now() + IP_LOCKOUT_DURATION_MS;
      store.ipBlocks[ip] = blockedUntil;
      saveStore();
      return res.status(403).json({
        blocked: true,
        blockedUntil,
        remainingMs: IP_LOCKOUT_DURATION_MS,
        error: 'Wrong admin credentials. Your IP address has been blocked for 2 hours.',
      });
    }

    const token = signToken({
      sub: 'honey_admin',
      role: 'admin',
      exp: Date.now() + 12 * 60 * 60 * 1000,
    });
    setSessionCookie(req, res, 'honey_admin_token', token, 12 * 60 * 60);
    res.json({ authenticated: true, token });
  });

  app.post('/api/admin/logout', (req, res) => {
    clearSessionCookie(req, res, 'honey_admin_token');
    res.json({ ok: true });
  });

  // --- Admin Dashboard Data ---
  app.get('/api/admin/dashboard', requireAdmin, (_req, res) => {
    res.json({
      siteConfig: store.siteConfig,
      packages: store.packages,
      users: store.users.map(sanitizeUser),
      deposits: store.deposits,
      orders: store.orders,
      notifications: store.notifications.filter((n) => n.targetRole === 'admin'),
      analytics: store.analytics,
      blockedIpCount: Object.keys(store.ipBlocks).filter((k) => store.ipBlocks[k] > Date.now()).length,
    });
  });

  app.post('/api/admin/notifications/read', requireAdmin, (_req, res) => {
    for (const n of store.notifications) {
      if (n.targetRole === 'admin') {
        n.isRead = true;
      }
    }
    saveStore();
    res.json({ ok: true });
  });

  // --- Admin Site CMS (Logo, Theme Light/Dark, Notice, Banners, Payment Numbers, Support) ---
  app.put('/api/admin/config', requireAdmin, (req, res) => {
    const body = req.body || {};
    const next = { ...store.siteConfig };

    if (typeof body.siteName === 'string' && body.siteName.trim()) {
      next.siteName = body.siteName.trim().slice(0, 80);
    }
    if (body.themeMode === 'light' || body.themeMode === 'dark') {
      next.themeMode = body.themeMode;
    }
    if (typeof body.noticeText === 'string') {
      next.noticeText = body.noticeText.trim().slice(0, 500);
    }
    if (body.logoUrl !== undefined) {
      const validLogo = validateSafeImageUrl(body.logoUrl, 200000);
      if (validLogo === null) {
        return res.status(400).json({ error: 'Invalid logo image.' });
      }
      if (validLogo) next.logoUrl = validLogo;
    }
    if (Array.isArray(body.banners)) {
      const cleanedBanners: BannerItem[] = [];
      for (const b of body.banners.slice(0, 8)) {
        if (!b || typeof b !== 'object') continue;
        const validImg = validateSafeImageUrl(b.imageUrl, 250000);
        if (!validImg) continue;
        cleanedBanners.push({
          id: typeof b.id === 'string' && b.id ? b.id.slice(0, 40) : `banner_${crypto.randomUUID().slice(0, 8)}`,
          title: typeof b.title === 'string' ? b.title.trim().slice(0, 80) : 'Promotion',
          imageUrl: validImg,
          link: validateSafeLink(b.link),
        });
      }
      next.banners = cleanedBanners;
    }
    if (body.paymentNumbers && typeof body.paymentNumbers === 'object') {
      next.paymentNumbers = {
        bkash: String(body.paymentNumbers.bkash || next.paymentNumbers.bkash).trim().slice(0, 20),
        nagad: String(body.paymentNumbers.nagad || next.paymentNumbers.nagad).trim().slice(0, 20),
        rocket: String(body.paymentNumbers.rocket || next.paymentNumbers.rocket).trim().slice(0, 20),
        upay: String(body.paymentNumbers.upay || next.paymentNumbers.upay).trim().slice(0, 20),
      };
    }
    if (typeof body.paymentInstructions === 'string') {
      next.paymentInstructions = body.paymentInstructions.trim().slice(0, 400);
    }
    if (typeof body.telegramSupportUrl === 'string') {
      next.telegramSupportUrl = validateSafeLink(body.telegramSupportUrl);
    }
    if (typeof body.telegramGroupUrl === 'string') {
      next.telegramGroupUrl = validateSafeLink(body.telegramGroupUrl);
    }
    if (typeof body.supportHours === 'string') {
      next.supportHours = body.supportHours.trim().slice(0, 120);
    }

    next.updatedAt = nowIso();
    store.siteConfig = next;
    saveStore();
    broadcastPublicState();
    res.json({ siteConfig: store.siteConfig });
  });

  // --- Admin Packages CRUD ---
  app.post('/api/admin/packages', requireAdmin, (req, res) => {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : 'Top-Up';
    const price = Number(body.price);
    const deliveryLabel =
      typeof body.deliveryLabel === 'string' && body.deliveryLabel.trim()
        ? body.deliveryLabel.trim().slice(0, 40)
        : 'Auto Delivery';
    const description =
      typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
    const imageUrl = validateSafeImageUrl(
      body.imageUrl || '/src/assets/images/pkg_diamond_pack_1795444652233.jpg',
      250000
    );

    if (title.length < 1 || title.length > 100) {
      return res.status(400).json({ error: 'Package title is required (max 100 chars).' });
    }
    if (!Number.isFinite(price) || price < 1 || price > 1000000) {
      return res.status(400).json({ error: 'Valid package price is required.' });
    }
    if (!imageUrl) {
      return res.status(400).json({ error: 'Invalid package image.' });
    }

    const ts = nowIso();
    const pkg: PackageItem = {
      id: `pkg_${crypto.randomUUID().slice(0, 10)}`,
      title,
      category: category.slice(0, 60),
      price: Math.round(price),
      deliveryLabel,
      imageUrl,
      description,
      isActive: body.isActive !== false,
      createdAt: ts,
      updatedAt: ts,
    };
    store.packages.unshift(pkg);
    saveStore();
    broadcastPublicState();
    res.status(201).json({ package: pkg });
  });

  app.put('/api/admin/packages/:id', requireAdmin, (req, res) => {
    const pkg = store.packages.find((p) => p.id === req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Package not found.' });
    const body = req.body || {};
    if (typeof body.title === 'string' && body.title.trim()) {
      pkg.title = body.title.trim().slice(0, 100);
    }
    if (typeof body.category === 'string' && body.category.trim()) {
      pkg.category = body.category.trim().slice(0, 60);
    }
    if (body.price !== undefined) {
      const p = Number(body.price);
      if (Number.isFinite(p) && p >= 1 && p <= 1000000) pkg.price = Math.round(p);
    }
    if (typeof body.deliveryLabel === 'string') {
      pkg.deliveryLabel = body.deliveryLabel.trim().slice(0, 40);
    }
    if (typeof body.description === 'string') {
      pkg.description = body.description.trim().slice(0, 500);
    }
    if (typeof body.isActive === 'boolean') {
      pkg.isActive = body.isActive;
    }
    if (body.imageUrl !== undefined) {
      const validImg = validateSafeImageUrl(body.imageUrl, 250000);
      if (validImg) pkg.imageUrl = validImg;
    }
    pkg.updatedAt = nowIso();
    saveStore();
    broadcastPublicState();
    res.json({ package: pkg });
  });

  app.delete('/api/admin/packages/:id', requireAdmin, (req, res) => {
    const idx = store.packages.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Package not found.' });
    store.packages.splice(idx, 1);
    saveStore();
    broadcastPublicState();
    res.json({ ok: true });
  });

  // --- Admin Deposit Approval / Rejection ---
  app.post('/api/admin/deposits/:id/decision', requireAdmin, (req, res) => {
    const dep = store.deposits.find((d) => d.id === req.params.id);
    if (!dep) return res.status(404).json({ error: 'Deposit not found.' });
    if (dep.status !== 'pending') {
      return res.status(400).json({ error: 'Deposit has already been processed.' });
    }
    const decision = req.body?.decision;
    const adminNote = typeof req.body?.adminNote === 'string' ? req.body.adminNote.trim().slice(0, 200) : '';
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ error: 'Invalid decision.' });
    }

    const ts = nowIso();
    dep.status = decision === 'approve' ? 'approved' : 'rejected';
    dep.adminNote = adminNote;
    dep.updatedAt = ts;

    const user = store.users.find((u) => u.id === dep.userId);
    if (decision === 'approve' && user) {
      user.walletBalance += dep.amount;
      user.updatedAt = ts;
      store.walletTransactions.unshift({
        id: `tx_${crypto.randomUUID().slice(0, 10)}`,
        userId: user.id,
        type: 'deposit',
        amount: dep.amount,
        note: `Approved ${dep.method.toUpperCase()} deposit (${dep.transactionId})`,
        createdAt: ts,
      });
      addNotification(
        'user',
        'Deposit Approved',
        `৳${dep.amount} via ${dep.method.toUpperCase()} has been added to your wallet!`,
        'deposit',
        user.id
      );
      broadcastEvent('user_update', { userId: user.id, user: sanitizeUser(user) });
    } else if (decision === 'reject' && user) {
      addNotification(
        'user',
        'Deposit Rejected',
        `Your ৳${dep.amount} ${dep.method.toUpperCase()} deposit (${dep.transactionId}) was rejected. ${adminNote}`.trim(),
        'deposit',
        user.id
      );
    }

    saveStore();
    broadcastEvent('deposit_update', dep);
    res.json({ deposit: dep });
  });

  // --- Admin User Wallet Add / Cut & Password Management ---
  app.post('/api/admin/users/:id/balance', requireAdmin, (req, res) => {
    const user = store.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const action = req.body?.action;
    const amount = Number(req.body?.amount);
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 140)
        : action === 'add'
        ? 'Admin Wallet Credit'
        : 'Admin Wallet Deduction';

    if (action !== 'add' && action !== 'cut') {
      return res.status(400).json({ error: 'Action must be add or cut.' });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    const rounded = Math.round(amount);
    const ts = nowIso();
    if (action === 'add') {
      user.walletBalance += rounded;
    } else {
      user.walletBalance = Math.max(0, user.walletBalance - rounded);
    }
    user.updatedAt = ts;

    store.walletTransactions.unshift({
      id: `tx_${crypto.randomUUID().slice(0, 10)}`,
      userId: user.id,
      type: action === 'add' ? 'admin_add' : 'admin_cut',
      amount: action === 'add' ? rounded : -rounded,
      note: reason,
      createdAt: ts,
    });

    addNotification(
      'user',
      action === 'add' ? 'Wallet Credited' : 'Wallet Adjusted',
      action === 'add'
        ? `Admin added ৳${rounded} to your wallet. (${reason})`
        : `Admin deducted ৳${rounded} from your wallet. (${reason})`,
      'wallet',
      user.id
    );

    saveStore();
    broadcastEvent('user_update', { userId: user.id, user: sanitizeUser(user) });
    res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/admin/users/:id/password', requireAdmin, (req, res) => {
    const user = store.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 6 || newPassword.length > 100) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const { salt, hash } = hashUserPassword(newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    user.updatedAt = nowIso();
    saveStore();
    addNotification(
      'user',
      'Password Updated',
      'Your account password was updated by an administrator.',
      'system',
      user.id
    );
    res.json({ ok: true });
  });

  // --- Admin Order Status Update ---
  app.post('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const status = req.body?.status;
    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const prevStatus = order.status;
    order.status = status;
    order.updatedAt = nowIso();

    const user = store.users.find((u) => u.id === order.userId);
    if (status === 'cancelled' && prevStatus !== 'cancelled' && user) {
      user.walletBalance += order.amount;
      user.updatedAt = order.updatedAt;
      store.walletTransactions.unshift({
        id: `tx_${crypto.randomUUID().slice(0, 10)}`,
        userId: user.id,
        type: 'order_refund',
        amount: order.amount,
        note: `Refund for cancelled order ${order.packageTitle}`,
        createdAt: order.updatedAt,
      });
      broadcastEvent('user_update', { userId: user.id, user: sanitizeUser(user) });
    }
    if (user) {
      addNotification(
        'user',
        `Order ${status.toUpperCase()}`,
        `Order ${order.packageTitle} for ${order.playerId} is now ${status}.`,
        'order',
        user.id
      );
    }

    saveStore();
    broadcastEvent('order_update', order);
    res.json({ order });
  });

  // --- Vite Dev / Static Prod ---
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HONEY TOP UP server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
