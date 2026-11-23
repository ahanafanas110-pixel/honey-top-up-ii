import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
  onSnapshot,
  collection,
  query,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { PackageItem, SiteConfig } from '../types.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;

export async function testFirestoreConnection(): Promise<boolean> {
  if (connectionTested) return true;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export async function signInWithGoogleForCloudSync(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

export function watchFirebaseAuth(callback: (user: FirebaseUser | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function syncSiteConfigToFirestore(config: SiteConfig): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const path = 'site_config/main';
  try {
    await setDoc(doc(db, 'site_config', 'main'), {
      siteName: config.siteName.slice(0, 80),
      logoUrl: config.logoUrl.slice(0, 150000),
      themeMode: config.themeMode,
      noticeText: config.noticeText.slice(0, 500),
      telegramSupportUrl: config.telegramSupportUrl.slice(0, 300),
      telegramGroupUrl: config.telegramGroupUrl.slice(0, 300),
      supportHours: config.supportHours.slice(0, 120),
      bkashNumber: config.paymentNumbers.bkash.slice(0, 20),
      nagadNumber: config.paymentNumbers.nagad.slice(0, 20),
      rocketNumber: config.paymentNumbers.rocket.slice(0, 20),
      upayNumber: config.paymentNumbers.upay.slice(0, 20),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncPackageToFirestore(pkg: PackageItem): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const path = `packages/${pkg.id}`;
  try {
    await setDoc(doc(db, 'packages', pkg.id), {
      id: pkg.id,
      title: pkg.title.slice(0, 100),
      category: pkg.category.slice(0, 60),
      price: Number(pkg.price),
      deliveryLabel: pkg.deliveryLabel.slice(0, 40),
      imageUrl: pkg.imageUrl.slice(0, 200000),
      description: pkg.description.slice(0, 500),
      isActive: Boolean(pkg.isActive),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePublicFirestoreSiteConfig(
  onUpdate: (partial: Partial<SiteConfig>) => void
): Unsubscribe {
  const path = 'site_config/main';
  return onSnapshot(
    doc(db, 'site_config', 'main'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onUpdate({
        siteName: typeof d.siteName === 'string' ? d.siteName : undefined,
        themeMode: d.themeMode === 'dark' || d.themeMode === 'light' ? d.themeMode : undefined,
        noticeText: typeof d.noticeText === 'string' ? d.noticeText : undefined,
        logoUrl: typeof d.logoUrl === 'string' ? d.logoUrl : undefined,
      });
    },
    (error) => {
      // Public doc may not exist yet before first cloud sync; ignore not-found/permission on unseeded doc
      if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
        return;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribePublicFirestorePackages(
  onReady: (count: number) => void
): Unsubscribe {
  const path = 'packages';
  const q = query(collection(db, path), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      onReady(snap.size);
    },
    (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
