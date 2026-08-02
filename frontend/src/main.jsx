import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import useAuthStore from './store/authStore';
import { useUIStore } from './store/uiStore';
import { useThemeStore } from './store/themeStore';
import { initFirebase } from './config/firebase';
import './index.css';

if (import.meta.env.VITE_SENTRY_DSN) {
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

useUIStore.getState().initTheme();
useThemeStore.getState().initBrand();

const queryClient = new QueryClient();
const MIN_SPLASH_MS = 1800;
/** Extra time after auth so the first route can mount under the splash. */
const POST_READY_BUFFER_MS = 500;
/** Must match #splash transition duration in index.html (420ms). */
const SPLASH_EXIT_MS = 420;

const AuthInit = ({ children }) => {
  const [ready, setReady] = useState(false);
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initFirebase();
        await initAuth();
      } catch (e) {
        console.error('[Firebase]', e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initAuth]);

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
