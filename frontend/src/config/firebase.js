import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getApiBaseUrl } from './apiBase';

let firebaseApp = null;
let auth = null;
let googleProvider = null;

function parseJsonConfig(text, status) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('{')) {
    throw new Error(
      'Firebase config response was not JSON (often the SPA index.html). Set VITE_API_URL at build time to your backend origin, e.g. https://api.yourdomain.com — not the static site URL.',
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`Failed to parse Firebase config JSON (HTTP ${status}).`);
  }
}

/**
 * Load Firebase web config from the backend (no VITE_FIREBASE_* in the frontend).
 * Must be awaited before using auth or googleProvider.
 */
export async function initFirebase() {
  if (auth) return;

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/public/firebase-config`);
  const text = await res.text();

  if (!res.ok) {
    const err = parseJsonConfig(text, res.status);
    throw new Error(
      err.error || `Failed to load Firebase config (${res.status}). Is the backend running?`,
    );
  }

  const config = parseJsonConfig(text, res.status);
  if (!config.apiKey || !config.projectId) {
    throw new Error('Firebase config from server is incomplete. Check backend FIREBASE_* env vars.');
  }
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
