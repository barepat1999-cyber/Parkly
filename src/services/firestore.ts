import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Spot, Report, User } from '../types';
import { updateConfidence, computeStatus } from '../domain/confidence';

// Convert Firestore Timestamp to Date
function toDate(timestamp: any): Date {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date(timestamp);
}

// Convert Date to Firestore Timestamp
function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

// Spot operations
export async function getSpot(spotId: string): Promise<Spot | null> {
  if (!db) {
    throw new Error('Firestore is not initialized. Please check your Firebase configuration.');
  }
  const spotDoc = await getDoc(doc(db, 'spots', spotId));
  if (!spotDoc.exists()) {
    return null;
  }
  const data = spotDoc.data();
  return {
    id: spotDoc.id,
    ...data,
    lastUpdated: toDate(data.lastUpdated),
  } as Spot;
}

export async function getSpotsInRadius(
  centerLat: number,
  centerLng: number,
  radiusKm: number = 5
): Promise<Spot[]> {
  if (!db) {
    console.warn('Firestore is not initialized. Returning empty array.');
    return [];
  }
  // Note: Firestore doesn't support geo queries natively
  // In production, use GeoFirestore or similar
  // For MVP, we'll fetch all spots and filter client-side
  const spotsSnapshot = await getDocs(collection(db, 'spots'));
  const spots: Spot[] = [];
  
  spotsSnapshot.forEach((doc) => {
    const data = doc.data();
    const spot: Spot = {
      id: doc.id,
      ...data,
      lastUpdated: toDate(data.lastUpdated),
    } as Spot;
    
    // Simple distance calculation (Haversine would be better)
    const distance = Math.sqrt(
      Math.pow(spot.lat - centerLat, 2) + Math.pow(spot.lng - centerLng, 2)
    ) * 111; // Rough km conversion
    
    if (distance <= radiusKm) {
      spots.push(spot);
    }
  });
  
  return spots;
}

export async function createSpot(spot: Omit<Spot, 'id'>): Promise<string> {
  if (!db) {
    throw new Error('Firestore is not initialized. Please check your Firebase configuration.');
  }
  const spotRef = doc(collection(db, 'spots'));
  await setDoc(spotRef, {
    ...spot,
    lastUpdated: toTimestamp(spot.lastUpdated),
  });
  return spotRef.id;
}

export async function updateSpotStatus(
  spotId: string,
  reportType: 'free' | 'occupied',
  reporterWeight: number = 1.0
): Promise<void> {
  const spot = await getSpot(spotId);
  if (!spot) {
    throw new Error('Spot not found');
  }

  const newConfidence = updateConfidence(spot.confidence, reportType, reporterWeight);
  const now = new Date();
  const newStatus = computeStatus(newConfidence, now, now);

  if (!db) {
    throw new Error('Firestore is not initialized. Please check your Firebase configuration.');
  }
  await updateDoc(doc(db, 'spots', spotId), {
    confidence: newConfidence,
    status: newStatus,
    lastUpdated: toTimestamp(now),
  });
}

// Report operations
export async function createReport(
  userId: string,
  spotId: string,
  reportType: 'free' | 'occupied',
  lat: number,
  lng: number
): Promise<string> {
  if (!db) {
    throw new Error('Firestore is not initialized. Please check your Firebase configuration.');
  }
  const reportRef = await addDoc(collection(db, 'reports'), {
    userId,
    spotId,
    reportType,
    lat,
    lng,
    createdAt: serverTimestamp(),
  });
  return reportRef.id;
}

export async function getUserReports(
  userId: string,
  limitCount: number = 30
): Promise<Report[]> {
  if (!db) {
    console.warn('Firestore is not initialized. Returning empty array.');
    return [];
  }
  const q = query(
    collection(db, 'reports'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  const reports: Report[] = [];
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    reports.push({
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt),
    } as Report);
  });
  
  return reports;
}

// User operations
export async function getUser(userId: string): Promise<User | null> {
  if (!db) {
    console.warn('Firestore is not initialized. Returning null.');
    return null;
  }
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) {
    return null;
  }
  const data = userDoc.data();
  return {
    id: userDoc.id,
    ...data,
    createdAt: toDate(data.createdAt),
    lastActiveAt: toDate(data.lastActiveAt),
  } as User;
}

export async function createOrUpdateUser(userId: string): Promise<void> {
  if (!db) {
    console.warn('Firestore is not initialized. Skipping user creation.');
    return;
  }
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    await setDoc(userRef, {
      karma: 0,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    });
  } else {
    await updateDoc(userRef, {
      lastActiveAt: serverTimestamp(),
    });
  }
}

export async function incrementUserKarma(userId: string, amount: number = 1): Promise<void> {
  if (!db) {
    console.warn('Firestore is not initialized. Skipping karma increment.');
    return;
  }
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    const currentKarma = userDoc.data().karma || 0;
    await updateDoc(userRef, {
      karma: currentKarma + amount,
    });
  }
}
