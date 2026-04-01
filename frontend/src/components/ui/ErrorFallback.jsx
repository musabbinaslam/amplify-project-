import React from 'react';
import { AlertCircle } from 'lucide-react';

const ErrorFallback = ({ error, resetErrorBoundary }) => {
  return (
    <div style={{ 
      padding: '24px', background: 'rgba(239, 68, 68, 0.1)', 
      border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px',
      color: 'white', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
        <AlertCircle size={24} />
        <h3 style={{ margin: 0 }}>Something went wrong</h3>
      </div>
      <pre style={{ background: '#000', padding: '12px', borderRadius: '8px', fontSize: '12px', overflow: 'auto', color: '#ffaaaa' }}>
        {error.message}
      </pre>
      <button 
        onClick={resetErrorBoundary}
        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', alignSelf: 'flex-start', fontWeight: 'bold' }}
      >
        Try again
      </button>
    </div>
  );
};

export default ErrorFallback;
