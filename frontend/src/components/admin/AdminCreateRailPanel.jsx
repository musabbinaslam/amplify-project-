import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import classes from './AdminCreateRailPanel.module.css';

const BUTTON_FADE = { duration: 0.2, ease: 'easeInOut' };

/* eslint-disable react/prop-types */
export default function AdminCreateRailPanel({
  open = false,
  onOpenChange,
  triggerLabel = 'Create',
  title = 'New',
  hint = '',
  children,
}) {
  const reduceMotion = useReducedMotion();
  const buttonFade = reduceMotion ? { duration: 0 } : BUTTON_FADE;

  return (
    <div className={`glass ${classes.panel} ${open ? classes.panelOpen : ''}`}>
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <div
            key="create-form"
            id="settings-create-panel"
            className={classes.formBody}
          >
            <div className={classes.headRow}>
              <div className={classes.headCopy}>
                <p className={classes.headTitle}>{title}</p>
                {hint ? <p className={classes.headHint}>{hint}</p> : null}
              </div>
              <button
                type="button"
                className={classes.closeBtn}
                onClick={() => onOpenChange?.(false)}
                aria-label="Close create form"
              >
                <X size={16} />
              </button>
            </div>
            {children}
          </div>
        ) : (
          <motion.div
            key="create-trigger"
            className={classes.fadeBlock}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={buttonFade}
          >
            <button
              type="button"
              className={classes.trigger}
              onClick={() => onOpenChange?.(true)}
              aria-expanded={false}
              aria-controls="settings-create-panel"
            >
              <Plus size={16} />
              {triggerLabel}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
