export type ThemeMode = 'light' | 'dark';

export interface BannerItem {
  id: string;
  title: string;
  imageUrl: string;
  link: string;
}

export interface PaymentNumbers {
  bkash: string;
  nagad: string;
  rocket: string;
  upay: string;
}

export interface SiteConfig {
  siteName: string;
  logoUrl: string;
  themeMode: ThemeMode;
  noticeText: string;
  banners: BannerItem[];
  paymentNumbers: PaymentNumbers;
  paymentInstructions: string;
  telegramSupportUrl: string;
  telegramGroupUrl: string;
  supportHours: string;
  updatedAt: string;
}

export interface PackageItem {
  id: string;
  title: string;
  category: string;
  price: number;
  deliveryLabel: string;
  imageUrl: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RankName =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Heroic'
  | 'Master'
  | 'Grand Master';

export interface UserProfile {
  id: string;
  shortId: string;
  name: string;
  phone: string; // "+8801XXXXXXXXX"
  avatarUrl: string;
  walletBalance: number;
  totalSpend: number;
  weeklySpend: number;
  ordersCount: number;
  rank: RankName;
  supportPin: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'bkash' | 'nagad' | 'rocket' | 'upay';
export type DepositStatus = 'pending' | 'approved' | 'rejected';

export interface DepositRequest {
  id: string;
  userId: string;
  userShortId: string;
  userName: string;
  userPhone: string;
  amount: number;
  method: PaymentMethod;
  senderPhone: string;
  transactionId: string;
  status: DepositStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'pending' | 'completed' | 'cancelled';

export interface OrderItem {
  id: string;
  userId: string;
  userShortId: string;
  userName: string;
  userPhone: string;
  packageId: string;
  packageTitle: string;
  amount: number;
  playerId: string;
  voucherCode: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  targetRole: 'user' | 'admin';
  userId?: string;
  title: string;
  message: string;
  type: 'deposit' | 'order' | 'wallet' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface VisitorEvent {
  id: string;
  type: 'enter' | 'exit' | 'register' | 'login' | 'order' | 'deposit';
  label: string;
  createdAt: string;
}

export interface AnalyticsData {
  activeVisitors: number;
  totalVisits: number;
  totalExits: number;
  totalRegistrations: number;
  totalLogins: number;
  totalOrders: number;
  totalRevenue: number;
  recentEvents: VisitorEvent[];
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'admin_add' | 'admin_cut' | 'order_debit' | 'order_refund';
  amount: number;
  note: string;
  createdAt: string;
}
