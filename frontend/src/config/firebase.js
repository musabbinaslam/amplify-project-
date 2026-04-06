import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

let firebaseApp = null;
let auth = null;
let googleProvider = null;

/**
 * Load Firebase web config from the backend (no VITE_FIREBASE_* in the frontend).
 * Must be awaited before using auth or googleProvider.
 */
export async function initFirebase() {
  if (auth) return;

  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api/public/firebase-config`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error || `Failed to load Firebase config (${res.status}). Is the backend running?`,
    );
  }

  const config = await res.json();
  firebaseApp = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
  auth = getAuth(firebaseApp);
  googleProvider = new GoogleAuthProvider();
}

export { auth, googleProvider };
