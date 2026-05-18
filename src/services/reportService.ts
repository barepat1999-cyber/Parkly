import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, canUseFirestore, signInAnonymously } from '../config/firebase';

export type FirestoreReport = {
  id: string;
  userId: string;
  lat: number;
  lon: number;
  status: 'free' | 'occupied';
  createdAt: Date;
  dayKey: string;
};

/** Parse Firestore Timestamp to Date */
function toDate(timestamp: unknown): Date {
  if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
    return (timestamp as { toDate: () => Date }).toDate();
  }
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') return new Date(timestamp);
  return new Date();
}

/** YYYY-MM-DD in local timezone */
export function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ensure user is signed in (anonymous). Returns userId. */
export async function ensureAuth(): Promise<string> {
  if (!auth) throw new Error('Firebase Auth not initialized');
  const user = auth.currentUser;
  if (user) return user.uid;
  const cred = await signInAnonymously(auth);
  if (!cred.user.uid) throw new Error('Anonymous sign-in failed');
  return cred.user.uid;
}

/** Create a report in Firestore. Uses serverTimestamp for createdAt. */
export async function createReport(params: {
  lat: number;
  lon: number;
  status: 'free' | 'occupied';
}): Promise<string> {
  if (!db || !canUseFirestore()) throw new Error('Firestore not initialized');
  const userId = await ensureAuth();
  const dayKey = dayKeyFromDate(new Date());
  const docRef = await addDoc(collection(db, 'reports'), {
    userId,
    lat: params.lat,
    lon: params.lon,
    status: params.status,
    createdAt: serverTimestamp(),
    dayKey,
  });
  return docRef.id;
}

/** Map Firestore doc to FirestoreReport */
function docToReport(docId: string, data: Record<string, unknown>): FirestoreReport {
  return {
    id: docId,
    userId: String(data.userId ?? ''),
    lat: Number(data.lat ?? 0),
    lon: Number(data.lon ?? 0),
    status: (data.status === 'free' || data.status === 'occupied' ? data.status : 'free') as 'free' | 'occupied',
    createdAt: toDate(data.createdAt),
    dayKey: String(data.dayKey ?? ''),
  };
}

/** Subscribe to current user's reports. Returns unsubscribe function. */
export function subscribeUserReports(
  userId: string,
  onUpdate: (reports: FirestoreReport[]) => void,
  options?: { limitCount?: number }
): () => void {
  if (!db || !canUseFirestore()) {
    onUpdate([]);
    return () => {};
  }

  const limitCount = options?.limitCount ?? 20;

  const q = query(
    collection(db, 'reports'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const reports: FirestoreReport[] = snapshot.docs.map((doc) =>
        docToReport(doc.id, doc.data())
      );
      onUpdate(reports);
    },
    (err) => {
      if (__DEV__) console.debug('[reportService] subscribeUserReports error:', err);
      onUpdate([]);
    }
  );

  return () => unsub();
}

/** Subscribe to reports in real-time. Returns unsubscribe function. */
export function subscribeReports(
  onUpdate: (reports: FirestoreReport[]) => void,
  options?: { sinceMinutes?: number }
): () => void {
  if (!db || !canUseFirestore()) {
    onUpdate([]);
    return () => {};
  }

  const sinceMinutes = options?.sinceMinutes ?? 24 * 60; // default 24h
  const cutoff = Date.now() - sinceMinutes * 60 * 1000;

  const q = query(
    collection(db, 'reports'),
    where('createdAt', '>', new Date(cutoff)),
    orderBy('createdAt', 'desc'),
    limit(500)
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const reports: FirestoreReport[] = snapshot.docs.map((doc) =>
        docToReport(doc.id, doc.data())
      );
      onUpdate(reports);
    },
    (err) => {
      if (__DEV__) console.debug('[reportService] onSnapshot error:', err);
      onUpdate([]);
    }
  );

  return () => unsub();
}

/** Convert FirestoreReport to ParkingReport (app format) */
export function toParkingReport(r: FirestoreReport): {
  id: string;
  createdAt: number;
  latitude: number;
  longitude: number;
  status: 'available' | 'occupied';
  userId?: string;
} {
  return {
    id: r.id,
    createdAt: r.createdAt.getTime(),
    latitude: r.lat,
    longitude: r.lon,
    status: r.status === 'free' ? 'available' : 'occupied',
    userId: r.userId,
  };
}
