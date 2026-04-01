import React from 'react';

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
    <div className="spinner"></div>
    <span style={{ marginLeft: '12px' }}>Loading page...</span>
    <style>{`
      .spinner {
        width: 24px; height: 24px;
        border: 3px solid rgba(59, 130, 246, 0.2);
        border-top-color: var(--accent-blue);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  </div>
);

export default PageLoader;
