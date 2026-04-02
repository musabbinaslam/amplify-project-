import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import useAuthStore from './store/authStore';
import PageLoader from './components/ui/PageLoader';
import './index.css';

const queryClient = new QueryClient();

const AuthInit = ({ children }) => {
  const [ready, setReady] = useState(false);
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    initAuth().then(() => setReady(true));
  }, [initAuth]);

  if (!ready) return <PageLoader />;
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
