import React, { useLayoutEffect } from 'react';
import { AlertCircle } from 'lucide-react';

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

// ── Neutral full-screen loader shown during chunk-error reloads ──────────────
// Looks like the normal app loading state — user never sees red.
const ChunkReloadScreen = ({ exhausted, onManualReload }) => (
  <div style={{
    position: 'fixed', inset: 0,
    background: '#0a0a0f',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: '16px', zIndex: 9999,
  }}>
    {!exhausted ? (
      <>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.08)',
          borderTopColor: '#10b981',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>Loading…</p>
      </>
    ) : (
      <>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 }}>
          Having trouble loading. Try a hard refresh.
        </p>
        <button
          onClick={onManualReload}
          style={{
            background: '#10b981', color: '#fff', border: 'none',
            padding: '10px 22px', borderRadius: '8px',
            cursor: 'pointer', fontWeight: 700, fontSize: 14,
          }}
        >
          Reload
        </button>
      </>
    )}
  </div>
);

const ErrorFallback = ({ error, resetErrorBoundary }) => {
  const chunkFailed = isChunkError(error);
  const retries = Number(sessionStorage.getItem('chunk_retries') || '0');
  const exhausted = retries >= MAX_CHUNK_RETRIES;

  useLayoutEffect(() => {
    if (!chunkFailed) return;
    if (!exhausted) {
      sessionStorage.setItem('chunk_retries', String(retries + 1));
      window.location.reload();
    } else {
      sessionStorage.removeItem('chunk_retries');
    }
  }, [chunkFailed, exhausted, retries]);

  // ── Chunk error: always show neutral loader, never red ───────────────────
  if (chunkFailed) {
    return (
      <ChunkReloadScreen
        exhausted={exhausted}
        onManualReload={() => {
          sessionStorage.removeItem('chunk_retries');
          window.location.reload();
        }}
      />
    );
  }

  // ── Generic (non-chunk) error: show red error box ────────────────────────
  return (
    <div style={{
      padding: '24px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '12px', color: 'white',
      display: 'flex', flexDirection: 'column',
      gap: '16px', maxWidth: '600px',
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

