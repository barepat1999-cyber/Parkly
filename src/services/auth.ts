import {
  signInAnonymously,
  onAuthStateChanged,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { createOrUpdateUser } from './firestore';

export async function signInAnonymouslyAuth(): Promise<FirebaseUser> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Please check your Firebase configuration.');
  }
  const userCredential = await signInAnonymously(auth);
  const user = userCredential.user;
  
  // Create or update user in Firestore
  await createOrUpdateUser(user.uid);
  
  return user;
}

export async function signInWithEmail(email: string, password: string): Promise<FirebaseUser> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Please check your Firebase configuration.');
  }
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  await createOrUpdateUser(user.uid);
  
  return user;
}

export async function signUpWithEmail(email: string, password: string): Promise<FirebaseUser> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Please check your Firebase configuration.');
  }
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  await createOrUpdateUser(user.uid);
  
  return user;
}

export function getCurrentUser(): FirebaseUser | null {
  return auth?.currentUser || null;
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  if (!auth) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('Firebase Auth is not initialized');
    }
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
