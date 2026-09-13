import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { useUIStore } from './store/uiStore';
import { useThemeStore } from './store/themeStore';
import './index.css';

useUIStore.getState().initTheme();
useThemeStore.getState().initBrand();

let sentryInitialized = false;
async function initSentry() {
  if (sentryInitialized || !import.meta.env.VITE_SENTRY_DSN) return;
  sentryInitialized = true;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_APP_BUILD_ID,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

const queryClient = new QueryClient();
const MIN_SPLASH_MS = 1800;
/** Extra time after auth so the first route can mount under the splash. */
const POST_READY_BUFFER_MS = 500;
/** Must match #splash transition duration in index.html (420ms). */
const SPLASH_EXIT_MS = 420;

const AuthInit = ({ children }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ initFirebase }, { default: useAuthStore }] = await Promise.all([
          import('./config/firebase'),
          import('./store/authStore'),
        ]);
        await initFirebase();
        await useAuthStore.getState().initAuth();
        await initSentry();
      } catch (e) {
        console.error('[Firebase]', e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the HTML splash on top while the app mounts, routes load, and auth settles.
  useEffect(() => {
    if (!ready) return;
    const splash = document.getElementById('splash');
    if (!splash) return;

    const splashStartedAt = window.__SPLASH_START__ || Date.now();
    const elapsed = Date.now() - splashStartedAt;
    const waitMs = Math.max(
      Math.max(0, MIN_SPLASH_MS - elapsed),
      POST_READY_BUFFER_MS,
    );

    const hideTimer = window.setTimeout(() => {
      splash.classList.add('hidden');
      window.setTimeout(() => {
        splash.remove();
      }, SPLASH_EXIT_MS);
    }, waitMs);

    return () => window.clearTimeout(hideTimer);
  }, [ready]);

  // Mount the app immediately under the splash so chunks/data load in the background.
  return children;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthInit>
        <App />
        <Toaster position="top-right" />
      </AuthInit>
    </QueryClientProvider>
  </React.StrictMode>,
);
