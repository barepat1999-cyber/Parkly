import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, canUseFirestore } from '../config/firebase';
import { ensureAuth } from './reportService';
import { PROFILE_DATA_KEY } from '../constants/onboarding';

export type UserProfile = {
  name: string;
  age: number;
  carBrand: string;
  carModel: string;
  licensePlate: string;
  createdAt?: Date;
};

type StoredProfile = Omit<UserProfile, 'createdAt'> & { createdAt?: number };

function isValidProfile(data: unknown): data is StoredProfile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return !!(
    typeof d.name === 'string' &&
    typeof d.age === 'number' &&
    typeof d.carBrand === 'string' &&
    typeof d.carModel === 'string' &&
    typeof d.licensePlate === 'string'
  );
}

/** Load profile from AsyncStorage (fast, works offline) */
export async function getLocalProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidProfile(parsed)) return null;
    return {
      ...parsed,
      createdAt: parsed.createdAt ? new Date(parsed.createdAt) : undefined,
    };
  } catch {
    return null;
  }
}

/** Save profile to AsyncStorage */
export async function setLocalProfile(profile: Omit<UserProfile, 'createdAt'>): Promise<void> {
  const stored: StoredProfile = {
    ...profile,
    createdAt: Date.now(),
  };
  await AsyncStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(stored));
}

/** Check if user has a complete profile. Loads from AsyncStorage first (fast), then syncs with Firebase in background. */
export async function hasUserProfile(): Promise<boolean> {
  const local = await getLocalProfile();
  if (local) return true;

  if (!db || !canUseFirestore()) return false;
  try {
    const userId = await ensureAuth();
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return false;
    const data = userDoc.data();
    const hasComplete =
      !!(data?.name && data?.carBrand && data?.carModel && data?.licensePlate && typeof data?.age === 'number');
    if (hasComplete) {
      const profile: Omit<UserProfile, 'createdAt'> = {
        name: String(data.name),
        age: Number(data.age),
        carBrand: String(data.carBrand),
        carModel: String(data.carModel),
        licensePlate: String(data.licensePlate),
      };
      await setLocalProfile(profile);
    }
    return hasComplete;
  } catch {
    return false;
  }
}

/** Sync profile from Firebase in background. Call after app launch for fresh data. */
export async function syncProfileFromFirebase(): Promise<void> {
  if (!db || !canUseFirestore()) return;
  try {
    const userId = await ensureAuth();
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return;
    const data = userDoc.data();
    if (data?.name && data?.carBrand && data?.carModel && data?.licensePlate && typeof data?.age === 'number') {
      await setLocalProfile({
        name: String(data.name),
        age: Number(data.age),
        carBrand: String(data.carBrand),
        carModel: String(data.carModel),
        licensePlate: String(data.licensePlate),
      });
    }
  } catch {
    // Ignore – local profile remains valid
  }
}

/** Save user profile to Firestore users/{userId} and to AsyncStorage */
export async function saveUserProfile(profile: Omit<UserProfile, 'createdAt'>): Promise<void> {
  if (!db || !canUseFirestore()) {
    throw new Error('Firestore is not initialized.');
  }
  const userId = await ensureAuth();
  const userRef = doc(db, 'users', userId);
  await setDoc(
    userRef,
    {
      ...profile,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    },
    { merge: true }
  );
  await setLocalProfile(profile);
}
