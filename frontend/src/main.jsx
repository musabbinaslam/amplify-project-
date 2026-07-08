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
const MIN_SPLASH_MS = 1200;

const AuthInit = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    (async () => {
      try {
        await initFirebase();
        await initAuth();
      } catch (e) {
        console.error('[Firebase]', e);
      } finally {
        setReady(true);
      }
    })();
  }, [initAuth]);

  useEffect(() => {
    if (!ready) return;
    const splash = document.getElementById('splash');
    if (!splash) {
      setSplashDone(true);
      return;
    }

    const splashStartedAt = window.__SPLASH_START__ || Date.now();
    const elapsed = Date.now() - splashStartedAt;
    const waitMs = Math.max(0, MIN_SPLASH_MS - elapsed);

    const hideTimer = window.setTimeout(() => {
      splash.classList.add('hidden');
      window.setTimeout(() => {
        splash.remove();
        setSplashDone(true);
      }, 400);
    }, waitMs);

    return () => window.clearTimeout(hideTimer);
  }, [ready]);

  if (!ready || !splashDone) return null;

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
