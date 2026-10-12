import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { PhoneCall, Lock, CheckCircle2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import useDialerStore from '../../store/useDialerStore';
import { apiFetch } from '../../services/apiClient';
import classes from './DispositionModal.module.css';

const OPTIONS = [
  { id: 'not_interested', label: 'Not Interested' },
  { id: 'does_not_qualify', label: "Doesn't Qualify" },
  { id: 'over_age', label: 'Over Age' },
  { id: 'thinks_its_free', label: "Thinks It's Free" },
  { id: 'call_dropped', label: 'Call Dropped' },
  { id: 'callback', label: 'Call Back' },
  { id: 'busy', label: 'Busy' },
  { id: 'dead_air', label: 'Dead Air' },
  { id: 'policy_closed', label: '★ Policy Closed', isSpecial: true },
];

export default function DispositionModal({ onComplete }) {
  const pendingDispositionCall = useDialerStore((s) => s.pendingDispositionCall);
  const clearPendingDisposition = useDialerStore((s) => s.clearPendingDisposition);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Lock body scroll and prevent Escape key while disposition is pending
  useEffect(() => {
    if (!pendingDispositionCall) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [pendingDispositionCall]);

  if (!pendingDispositionCall) {
    return null;
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (!selected || submitting) return;
    setSubmitting(true);

    try {
      if (pendingDispositionCall !== 'test-sid') {
        await apiFetch(`/api/voice/logs/${pendingDispositionCall}`, {
          method: 'PATCH',
          body: { disposition: selected },
        });
      }

      toast.success('Disposition saved. Ready for next call.');
      clearPendingDisposition();
      queryClient.invalidateQueries({ queryKey: ['callLogs'] });
      onComplete?.();
    } catch (err) {
      console.error('[Disposition] Failed to save disposition:', err);
      toast.error('Failed to save disposition. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div
        className={classes.overlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="disposition-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <motion.div
          className={classes.modal}
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={classes.header}>
            <div className={classes.iconWrap}>
              <PhoneCall size={24} />
            </div>
            <h2 id="disposition-modal-title" className={classes.title}>
              Call Completed
            </h2>
            <p className={classes.subtitle}>
              Select the final outcome for the call that just ended to resume your dialer.
            </p>
          </div>

          <div className={classes.lockBanner}>
            <div className={classes.lockPulse} />
            <Lock size={14} />
            <span>Navigation locked until disposition is submitted</span>
          </div>

          <div className={classes.optionsGrid}>
            {OPTIONS.map((opt) => {
              const isSelected = selected === opt.id;
              const isPolicy = opt.isSpecial;

              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={submitting}
                  className={`
                    ${classes.optionBtn}
                    ${isPolicy ? classes.policyOption : ''}
                    ${isSelected ? classes.optionSelected : ''}
                    ${isSelected && isPolicy ? classes.policySelected : ''}
                  `}
                  onClick={() => setSelected(opt.id)}
                >
                  <span>{opt.label}</span>
                  <div
                    className={`
                      ${classes.radioIndicator}
                      ${isSelected ? classes.radioSelected : ''}
                      ${isSelected && isPolicy ? classes.radioPolicySelected : ''}
                    `}
                  >
                    {isSelected && <div className={classes.radioDot} />}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={classes.submitBtn}
            onClick={handleSubmit}
            disabled={!selected || submitting}
          >
            {submitting ? (
              'Saving Disposition...'
            ) : (
              <>
                <CheckCircle2 size={18} />
                Submit & Ready for Calls
              </>
            )}
          </button>

          <p className={classes.footerNote}>
            Your status remains in Wrap-Up and calls/tabs are paused until submitted.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
