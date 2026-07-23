import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../services/apiClient';
// No external CSS module, styling adheres to DESIGN.md directly
import { TOS_VERSION, TOS_HEADER, TOS_TEXT } from '../utils/legalText';

const TermsGatewayModal = () => {
  const { user, initAuth } = useAuthStore();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Allow a small 10px buffer for rounding errors across different screen resolutions
    if (scrollHeight - scrollTop <= clientHeight + 10) {
      setHasScrolledToBottom(true);
    }
  };

  // If the user is not logged in, or has already accepted the current version, don't show the modal.
  if (!user || user.acceptedTermsVersion === TOS_VERSION) {
    return null;
  }

  const handleAccept = async () => {
    if (!accepted) {
      toast.error('You must accept the Terms of Service to continue.');
      return;
    }
    
    setSubmitting(true);
    try {
      await apiFetch('/api/users/accept-terms', {
        method: 'POST',
        body: { version: TOS_VERSION },
      });
      toast.success('Terms accepted successfully!');
      // Re-initialize auth to pull the fresh user profile with the new acceptedTermsVersion
      await initAuth();
    } catch (error) {
      console.error('Failed to accept terms:', error);
      toast.error(error.message || 'Failed to accept terms. Please try again.');
      setSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div 
        style={{ 
          position: 'fixed', inset: 0, zIndex: 99999, 
          backgroundColor: 'rgba(0,0,0,0.7)', 
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem'
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          style={{ 
            maxWidth: '700px', width: '100%', 
            backgroundColor: 'var(--surface)', 
            border: '1px solid color-mix(in srgb, #ffffff 7%, transparent)',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <div style={{ 
            padding: '1.5rem', 
            borderBottom: '1px solid color-mix(in srgb, #ffffff 7%, transparent)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            backgroundColor: 'var(--surface-container-low)'
          }}>
            <ShieldCheck size={24} style={{ color: 'var(--brand-text)' }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Important Update
            </h2>
          </div>
          
          <div style={{ padding: '1.5rem', backgroundColor: 'var(--surface-container-low)' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
              We've updated our Terms of Service and Privacy Policy. To continue using Calls Flow, you must review and accept the latest terms.
            </p>
          </div>

          <div 
            onScroll={handleScroll}
            style={{ 
            padding: '1.5rem', 
            maxHeight: '40vh', 
            overflowY: 'auto', 
            backgroundColor: 'var(--surface-container-high)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)'
          }}>
            <pre style={{ 
              margin: 0, 
              whiteSpace: 'pre-wrap', 
              fontFamily: 'inherit',
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--text-secondary)'
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>{TOS_HEADER}</strong>
              {'\n'}
              {TOS_TEXT}
            </pre>
          </div>

          <div style={{ 
            padding: '1.5rem', 
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
            backgroundColor: 'var(--surface-container-low)'
          }}>
            <label style={{ 
              display: 'flex', alignItems: 'center', gap: '0.75rem', 
              cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed',
              userSelect: 'none',
              opacity: hasScrolledToBottom ? 1 : 0.6
            }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={submitting || !hasScrolledToBottom}
                style={{ width: '18px', height: '18px', cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed', flexShrink: 0 }}
              />
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {hasScrolledToBottom 
                  ? 'I have read and agree to the Terms of Service & Privacy Policy' 
                  : 'Please scroll to the bottom of the terms to agree'}
              </span>
            </label>
            
            <button
              onClick={handleAccept}
              disabled={submitting || !accepted}
              style={{ 
                width: '100%', 
                padding: '0.875rem', 
                fontSize: '14px', 
                fontWeight: 600,
                color: '#fff',
                backgroundColor: (submitting || !accepted) ? 'var(--surface-container-highest)' : 'var(--brand-text)',
                border: 'none',
                borderRadius: '6px',
                cursor: (submitting || !accepted) ? 'not-allowed' : 'pointer',
                opacity: (submitting || !accepted) ? 0.6 : 1,
                transition: 'background-color 0.2s, opacity 0.2s'
              }}
            >
              {submitting ? 'Updating Profile...' : 'Accept & Continue'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default TermsGatewayModal;
