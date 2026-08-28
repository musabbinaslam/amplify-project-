import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { getAdminQaPipelineStatus, setAdminAiFlagsEnabled } from '../../services/adminService';
import classes from './adminShared.module.css';

/* eslint-disable react/prop-types */
export default function AiFlagsMasterToggle({ onChange }) {
  const [enabled, setEnabled] = useState(true);
  const [envLocked, setEnvLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const applySnap = (snap) => {
    const on = snap?.enabled !== false;
    const locked = snap?.envLocked === true || snap?.aiFlagsEnvLocked === true;
    setEnabled(on);
    setEnvLocked(locked);
    onChangeRef.current?.({ enabled: on, envLocked: locked });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getAdminQaPipelineStatus();
        if (cancelled) return;
        applySnap({
          enabled: status?.aiFlagsGeminiEnabled !== false,
          envLocked: status?.aiFlagsEnvLocked === true,
        });
      } catch {
        /* banner still reports status */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyEnabled = async (next) => {
    setSaving(true);
    try {
      const out = await setAdminAiFlagsEnabled(next);
      applySnap({
        enabled: out?.enabled !== false,
        envLocked: out?.envLocked === true,
      });
      setConfirmOff(false);
      toast.success(next ? 'AI Flags is on.' : 'AI Flags is off.');
    } catch (err) {
      toast.error(err.message || 'Failed to update AI Flags');
    } finally {
      setSaving(false);
    }
  };

  const toggle = () => {
    if (envLocked || saving) return;
    if (enabled) {
      setConfirmOff(true);
      return;
    }
    void applyEnabled(true);
  };

  const closeConfirm = () => {
    if (saving) return;
    setConfirmOff(false);
  };

  return (
    <>
      <button
        type="button"
        className={`${classes.qaMasterToggle} ${enabled ? classes.qaMasterToggleOn : classes.qaMasterToggleOff}`}
        onClick={toggle}
        disabled={envLocked || saving}
        title={envLocked ? 'Locked off in server config (AI_FLAGS_GEMINI_ENABLED)' : (enabled ? 'Turn off AI Flags' : 'Turn on AI Flags')}
        aria-pressed={enabled}
      >
        {saving && !confirmOff ? 'Saving…' : (enabled ? 'AI Flags on' : 'AI Flags off')}
      </button>

      {confirmOff
        ? createPortal(
          <motion.div
            className={classes.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={closeConfirm}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-flags-off-title"
          >
            <motion.div
              className={`glass ${classes.modalBox}`}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={classes.modalHeader}>
                <h3 id="ai-flags-off-title">Turn off AI Flags</h3>
                <button
                  type="button"
                  className={classes.modalCloseBtn}
                  onClick={closeConfirm}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className={classes.modalSub}>
                New calls will not be analyzed, and compliance rules cannot be edited until you turn it back on.
              </p>
              <div className={classes.modalActions}>
                <button
                  type="button"
                  className={classes.modalCancelBtn}
                  onClick={closeConfirm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={classes.dangerBtn}
                  onClick={() => applyEnabled(false)}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Turn off'}
                </button>
              </div>
            </motion.div>
          </motion.div>,
          document.body,
        )
        : null}
    </>
  );
}
