import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db, canUseFirestore } from '../config/firebase';
import { ensureAuth } from './reportService';

export type ConfirmationResult = 'free' | 'taken';

/** Create a confirmation. Fails if user already confirmed this report. */
export async function createConfirmation(
  reportId: string,
  result: ConfirmationResult
): Promise<string> {
  if (!db || !canUseFirestore()) throw new Error('Firestore not initialized');
  const userId = await ensureAuth();

  const existing = await getDocs(
    query(
      collection(db, 'confirmations'),
      where('userId', '==', userId),
      where('reportId', '==', reportId)
    )
  );
  if (!existing.empty) {
    throw new Error('Already confirmed this report');
  }

  const docRef = await addDoc(collection(db, 'confirmations'), {
    userId,
    reportId,
    result,
    timestamp: serverTimestamp(),
  });
  return docRef.id;
}

/** Check if current user has already confirmed this report. */
export async function hasUserConfirmed(reportId: string): Promise<boolean> {
  if (!db || !canUseFirestore()) return false;
  try {
    const userId = await ensureAuth();
    const snap = await getDocs(
      query(
        collection(db, 'confirmations'),
        where('userId', '==', userId),
        where('reportId', '==', reportId)
      )
    );
    return !snap.empty;
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('[confirmationService] hasUserConfirmed failed:', e);
    }
    return true;
  }
}

/** Get confirmation counts per reportId (free confirmations only, for confidence boost). */
export async function getConfirmationCounts(
  reportIds: string[]
): Promise<Record<string, number>> {
  if (!db || !canUseFirestore() || reportIds.length === 0) return {};

  try {
    const counts: Record<string, number> = {};
    reportIds.forEach((id) => (counts[id] = 0));

    const batches: string[][] = [];
    for (let i = 0; i < reportIds.length; i += 10) {
      batches.push(reportIds.slice(i, i + 10));
    }

    for (const batch of batches) {
      const snap = await getDocs(
        query(
          collection(db, 'confirmations'),
          where('reportId', 'in', batch),
          where('result', '==', 'free')
        )
      );
      for (const doc of snap.docs) {
        const reportId = doc.data().reportId as string;
        if (reportId in counts) counts[reportId]++;
      }
    }

    return counts;
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('[confirmationService] getConfirmationCounts failed:', e);
    }
    return {};
  }
}
