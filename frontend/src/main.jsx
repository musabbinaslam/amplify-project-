import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import useAuthStore from './store/authStore';
import { useUIStore } from './store/uiStore';
import { useThemeStore } from './store/themeStore';
import { initFirebase } from './config/firebase';
import PageLoader from './components/ui/PageLoader';
import './index.css';

useUIStore.getState().initTheme();
useThemeStore.getState().initBrand();

const queryClient = new QueryClient();

const AuthInit = ({ children }) => {
  const [ready, setReady] = useState(false);
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

  if (!ready) return <PageLoader fullScreen />;

  // Dismiss the instant HTML splash once React is ready
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 400);
  }

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
