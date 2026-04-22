import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import classes from './UnsavedChangesBar.module.css';

const EXIT_DURATION_MS = 220;

const UnsavedChangesBar = ({
  visible = true,
  message = 'You have unsaved changes',
  onDiscard,
  onSave,
  saving = false,
  saveLabel = 'Save Changes',
  savingLabel = 'Saving...',
  discardLabel = 'Discard',
}) => {
  const [mounted, setMounted] = useState(visible);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setLeaving(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setLeaving(true);
    const timeout = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, EXIT_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [visible, mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`${classes.stickySaveBar} ${leaving ? classes.leaving : ''}`}
      role="region"
      aria-label="Unsaved changes"
      aria-hidden={leaving || undefined}
    >
      <span className={classes.saveBarText}>{message}</span>
      <div className={classes.saveBarActions}>
        <button
          type="button"
          onClick={onDiscard}
          className={classes.saveBarGhostBtn}
          disabled={saving || leaving}
        >
          {discardLabel}
        </button>
        <button
          type="button"
          onClick={onSave}
          className={classes.saveBarPrimaryBtn}
          disabled={saving || leaving}
        >
          {saving && <Loader2 size={14} className={classes.spinner} />}
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
};

export default UnsavedChangesBar;
