import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { PhoneCall, Lock, CheckCircle2, Star, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import useDialerStore from '../../store/useDialerStore';
import { apiFetch } from '../../services/apiClient';
import { DISPOSITIONS } from '../../constants/dispositions';
import classes from './DispositionModal.module.css';

export default function DispositionModal({ onComplete }) {
  const pendingDispositionCall = useDialerStore((s) => s.pendingDispositionCall);
  const clearPendingDisposition = useDialerStore((s) => s.clearPendingDisposition);
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const panelRef = useRef(null);

  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelected('');
    setSubmitting(false);
  }, [pendingDispositionCall]);

  useEffect(() => {
    if (!pendingDispositionCall) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll('button:not([disabled])')
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    const focusId = requestAnimationFrame(() => {
      panelRef.current?.querySelector('button')?.focus();
    });

    return () => {
      cancelAnimationFrame(focusId);
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
      setSelected('');
      queryClient.invalidateQueries({ queryKey: ['callLogs'] });
      onComplete?.();
    } catch (err) {
      console.error('[Disposition] Failed to save disposition:', err);
      toast.error('Failed to save disposition. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 16, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.96 },
      };

  return createPortal(
    <AnimatePresence>
      <div
        className={classes.overlay}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <motion.div
          key={pendingDispositionCall}
          ref={panelRef}
          className={`glass ${classes.modal}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="disposition-modal-title"
          aria-describedby="disposition-modal-subtitle"
          {...panelMotion}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={classes.header}>
            <div className={classes.iconWrap} aria-hidden="true">
              <PhoneCall size={18} />
            </div>
            <div className={classes.headerCopy}>
              <h2 id="disposition-modal-title" className={classes.title}>
                Call Completed
              </h2>
              <p id="disposition-modal-subtitle" className={classes.subtitle}>
                Select the outcome of the call that just ended to resume your dialer.
              </p>
            </div>
          </div>

          <div className={classes.lockBanner}>
            <span className={classes.lockPulse} aria-hidden="true" />
            <Lock size={14} />
            <span className={classes.lockCopy}>Navigation locked until disposition is submitted</span>
          </div>

          <div
            className={classes.optionsGrid}
            role="radiogroup"
            aria-labelledby="disposition-modal-title"
          >
            {DISPOSITIONS.map((opt) => {
              const isSelected = selected === opt.id;
              const isPolicy = opt.isSpecial;

              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={submitting}
                  className={[
                    classes.optionBtn,
                    isPolicy ? classes.policyOption : '',
                    isSelected ? classes.optionSelected : '',
                    isSelected && isPolicy ? classes.policySelected : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelected(opt.id)}
                >
                  <span className={classes.optionLabel}>
                    {isPolicy ? <Star size={15} fill="currentColor" aria-hidden="true" /> : null}
                    {opt.label}
                  </span>
                  <span
                    className={[
                      classes.radioIndicator,
                      isSelected ? classes.radioSelected : '',
                      isSelected && isPolicy ? classes.radioPolicySelected : '',
                    ].filter(Boolean).join(' ')}
                    aria-hidden="true"
                  >
                    {isSelected ? <span className={classes.radioDot} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={`${classes.submitBtn} ${submitting ? classes.submitBusy : ''}`}
            onClick={handleSubmit}
            disabled={!selected || submitting}
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className={classes.spinner} />
                Saving disposition...
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
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
