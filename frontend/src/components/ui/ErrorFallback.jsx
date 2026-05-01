import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

const MAX_CHUNK_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function isChunkError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('ChunkLoadError')
  );
}

const ErrorFallback = ({ error, resetErrorBoundary }) => {
  const [retrying, setRetrying] = useState(false);
  const chunkFailed = isChunkError(error);

  useEffect(() => {
    if (!chunkFailed) return;

    const retries = Number(sessionStorage.getItem('chunk_retries') || '0');
    if (retries < MAX_CHUNK_RETRIES) {
      sessionStorage.setItem('chunk_retries', String(retries + 1));
      const timer = setTimeout(() => {
        window.location.reload();
      }, RETRY_DELAY_MS * (retries + 1)); // back-off: 1.5s, 3s, 4.5s
      return () => clearTimeout(timer);
    }
    // Exhausted retries — clear so next manual reload starts fresh
    sessionStorage.removeItem('chunk_retries');
  }, [chunkFailed]);

  const handleManualReload = () => {
    sessionStorage.removeItem('chunk_retries');
    setRetrying(true);
    window.location.reload();
  };

  // ── Stale-deployment / chunk-load error UI ────────────────────────────────
  if (chunkFailed) {
    return (
      <div style={{
        padding: '28px 24px',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))',
        border: '1px solid rgba(16,185,129,0.25)',
        borderRadius: '14px',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        maxWidth: '480px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <RefreshCw size={22} style={{ color: '#10b981' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>New version available</h3>
        </div>
        <p style={{ margin: 0, fontSize: '14px', color: '#9ca3af', lineHeight: 1.6 }}>
          CallsFlow was just updated. Your browser has a stale copy of the app.
          Click below to reload and get the latest version instantly.
        </p>
        <button
          onClick={handleManualReload}
          disabled={retrying}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#10b981', color: 'white', border: 'none',
            padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
            alignSelf: 'flex-start', fontWeight: 700, fontSize: '14px',
            opacity: retrying ? 0.7 : 1,
          }}
        >
          <RefreshCw size={15} />
          {retrying ? 'Reloading…' : 'Reload App'}
        </button>
      </div>
    );
  }

  // ── Generic error UI ───────────────────────────────────────────────────────
  return (
    <div style={{
      padding: '24px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '12px',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      maxWidth: '600px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
        <AlertCircle size={24} />
        <h3 style={{ margin: 0 }}>Something went wrong</h3>
      </div>
      <pre style={{ background: '#000', padding: '12px', borderRadius: '8px', fontSize: '12px', overflow: 'auto', color: '#ffaaaa' }}>
        {error.message}
      </pre>
      <button
        onClick={() => {
          sessionStorage.removeItem('chunk_retries');
          resetErrorBoundary?.();
          window.location.reload();
        }}
        style={{
          background: '#ef4444', color: 'white', border: 'none',
          padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
          alignSelf: 'flex-start', fontWeight: 'bold',
        }}
      >
        Try again
      </button>
    </div>
  );
};

export default ErrorFallback;
