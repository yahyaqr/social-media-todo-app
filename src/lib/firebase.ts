import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { enableIndexedDbPersistence, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

const getFirebaseApp = (): FirebaseApp => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to your environment.');
  }

  return getApps().length ? getApp() : initializeApp(firebaseConfig);
};

export const getFirebaseAuth = () => getAuth(getFirebaseApp());

export const getFirestoreDb = () => getFirestore(getFirebaseApp());

let firestorePersistencePromise: Promise<void> | null = null;

export const initFirestorePersistence = async (): Promise<void> => {
  if (!isFirebaseConfigured || firestorePersistencePromise) {
    return firestorePersistencePromise ?? Promise.resolve();
  }

  const db = getFirestoreDb();
  firestorePersistencePromise = enableIndexedDbPersistence(db)
    .then(() => undefined)
    .catch(() => undefined);

  return firestorePersistencePromise;
};
