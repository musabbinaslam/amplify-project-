import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Bell, Shield } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import classes from './NotificationDetailModal.module.css';

const formatTime = (value) => {
  if (!value) return 'Just now';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Just now';
  return dt.toLocaleString();
};

const formatType = (type) => {
  if (type === 'ai_flag') return 'AI Flags';
  return String(type || 'general').replace(/_/g, ' ');
};

/* eslint-disable react/prop-types -- modal props are simple and stable */
const NotificationDetailModal = ({ notification, onClose }) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!notification) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onEsc);
    };
  }, [notification, onClose]);

  if (!notification) return null;

  const isAdminType = notification.type === 'admin_alert'
    || notification.type === 'ai_flag'
    || notification.type === 'contest_credited';
  const Icon = isAdminType ? Shield : Bell;
  const titleId = 'notificationDetailTitle';

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 } };

  return createPortal(
    <div
      className={classes.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <motion.div
        className={`glass ${classes.modal}`}
        onClick={(e) => e.stopPropagation()}
        {...panelMotion}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={classes.header}>
          <div className={classes.headerMain}>
            <div
              className={`${classes.iconWrap} ${isAdminType ? classes.iconWrapAdmin : ''}`}
              aria-hidden="true"
            >
              <Icon size={18} />
            </div>
            <h2 id={titleId}>{notification.title || 'Notification'}</h2>
          </div>
          <button type="button" className={classes.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className={classes.metaRow}>
          <span className={classes.metaChip}>
            {formatTime(notification.createdAt || notification.createdAtIso)}
          </span>
          <span className={`${classes.metaChip} ${isAdminType ? classes.metaChipAdmin : ''}`}>
            {formatType(notification.type)}
          </span>
        </div>

        <div className={classes.body}>
          {notification.body || 'No description available.'}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default NotificationDetailModal;
