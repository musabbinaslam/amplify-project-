import { useEffect } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import classes from './RegenerateApiKeyModal.module.css';

/* eslint-disable react/prop-types -- modal props are simple and stable */
const RegenerateApiKeyModal = ({ isOpen, regenerating, onClose, onConfirm }) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 } };

  return (
    <div
      className={classes.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="regenerateApiKeyTitle"
    >
      <motion.div
        className={`glass ${classes.modal}`}
        onClick={(e) => e.stopPropagation()}
        {...panelMotion}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={classes.header}>
          <div className={classes.headerMain}>
            <div className={classes.iconWrap} aria-hidden="true">
              <AlertTriangle size={18} />
            </div>
            <h2 id="regenerateApiKeyTitle">Regenerate API key?</h2>
          </div>
          <button type="button" className={classes.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className={classes.message}>
          This will revoke your current API key immediately. Any integrations using the old key will stop working until you update them.
        </p>

        <div className={classes.actions}>
          <button type="button" className={classes.cancelBtn} onClick={onClose} disabled={regenerating}>
            Cancel
          </button>
          <button type="button" className={classes.confirmBtn} onClick={onConfirm} disabled={regenerating}>
            {regenerating ? <Loader2 size={16} className={classes.spinner} /> : null}
            {regenerating ? 'Regenerating...' : 'Regenerate key'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default RegenerateApiKeyModal;
