import { useEffect, useState } from 'react';
import { X, Link2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import classes from './LinkNoteModal.module.css';

/* eslint-disable react/prop-types -- modal props are simple and stable */
const LinkNoteModal = ({ isOpen, onClose, onConfirm }) => {
  const reduceMotion = useReducedMotion();
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setUrl('');
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 } };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    onClose();
  };

  return (
    <div
      className={classes.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="linkNoteTitle"
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
              <Link2 size={18} />
            </div>
            <h2 id="linkNoteTitle">Insert link</h2>
          </div>
          <button type="button" className={classes.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form className={classes.form} onSubmit={handleSubmit}>
          <label className={classes.label} htmlFor="linkNoteUrl">
            URL
          </label>
          <input
            id="linkNoteUrl"
            type="url"
            className={classes.input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            autoFocus
          />

          <div className={classes.actions}>
            <button type="button" className={classes.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={classes.submitBtn} disabled={!url.trim()}>
              Insert link
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default LinkNoteModal;
