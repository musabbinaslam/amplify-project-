import React, { useLayoutEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

const MAX_CHUNK_RETRIES = 3;

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
  const retries = Number(sessionStorage.getItem('chunk_retries') || '0');

  // ── Silent auto-reload for stale chunk errors ─────────────────────────────
  // useLayoutEffect fires BEFORE the browser paints — user sees nothing.
  useLayoutEffect(() => {
    if (!chunkFailed) return;
    if (retries < MAX_CHUNK_RETRIES) {
      sessionStorage.setItem('chunk_retries', String(retries + 1));
      window.location.reload();
    } else {
      // Exhausted retries — clear counter so manual reload starts fresh
      sessionStorage.removeItem('chunk_retries');
    }
  }, [chunkFailed, retries]);

  // While reload is in flight, render nothing so user sees no flash
  if (chunkFailed && retries < MAX_CHUNK_RETRIES) return null;


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
