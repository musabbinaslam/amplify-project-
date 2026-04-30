import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import { getApiBaseUrl } from './apiBase';

let firebaseApp = null;
let auth = null;
let googleProvider = null;
let analytics = null;
let appCheck = null;

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
    ...(config.measurementId ? { measurementId: config.measurementId } : {}),
  });
  auth = getAuth(firebaseApp);
  googleProvider = new GoogleAuthProvider();

  // App Check is optional but strongly recommended before enforcing in Firebase Console.
  // Set VITE_FIREBASE_APPCHECK_SITE_KEY in frontend env (stage/prod specific).
  const appCheckSiteKey = (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim();
  if (appCheckSiteKey) {
    try {
      const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
      appCheck = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      console.warn('[Firebase] App Check initialization failed:', err?.message || err);
    }
  } else {
    console.warn(
      '[Firebase] App Check site key is missing (VITE_FIREBASE_APPCHECK_SITE_KEY). App Check remains disabled on this client.',
    );
  }

  // Analytics is optional and only available in supported browser environments.
  if (config.measurementId) {
    try {
      if (await isAnalyticsSupported()) {
        analytics = getAnalytics(firebaseApp);
      }
    } catch (err) {
      console.warn('[Firebase] Analytics disabled:', err?.message || err);
    }
  }
}

export { auth, googleProvider, analytics, appCheck };
