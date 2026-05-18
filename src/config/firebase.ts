import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'demo-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:abcdef',
};

const hasValidConfig = firebaseConfig.apiKey !== 'demo-key';

/** True when we can write to Firestore: production config OR emulator in dev */
export function canUseFirestore(): boolean {
  return (
    hasValidConfig ||
    (typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      !!(global as { __firebaseEmulatorsConnected?: boolean }).__firebaseEmulatorsConnected)
  );
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;
let initError: unknown;

function initFirebase(): void {
  if (functions) return;
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'us-central1');

    if (typeof __DEV__ !== 'undefined' && __DEV__ && !(global as { __firebaseEmulatorsConnected?: boolean }).__firebaseEmulatorsConnected) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9199');
      connectFirestoreEmulator(db, '127.0.0.1', 8082);
      connectFunctionsEmulator(functions, '127.0.0.1', 5002);
      (global as { __firebaseEmulatorsConnected?: boolean }).__firebaseEmulatorsConnected = true;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.debug('[Firebase] Using emulators: Auth 9199, Firestore 8082, Functions 5002');
      }
    }
  } catch (error) {
    initError = error;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('[Firebase] init failed:', error);
    }
  }
}

initFirebase();

export function getFunctionsInstance(): Functions | undefined {
  if (!functions) initFirebase();
  return functions;
}

export function getInitError(): unknown {
  return initError;
}

export { app, auth, db, functions, hasValidConfig };
export { signInAnonymously };
