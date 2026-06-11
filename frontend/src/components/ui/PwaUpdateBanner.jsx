import React from 'react';
import useDialerStore from '../../store/useDialerStore';
import { useAppUpdateAvailable } from '../../hooks/useAppUpdateAvailable';
import classes from './PwaUpdateBanner.module.css';

const PwaUpdateBanner = () => {
  const callState = useDialerStore((s) => s.callState);
  const inCall = callState === 'ringing' || callState === 'active';
  const { updateAvailable, applyUpdate } = useAppUpdateAvailable();

  if (!updateAvailable) return null;

  return (
    <div className={classes.banner} role="alert" aria-live="polite">
      <p className={classes.text}>A new version of CallsFlow is ready.</p>
      <button
        type="button"
        className={classes.button}
        onClick={applyUpdate}
        disabled={inCall}
      >
        {inCall ? 'Refresh after your call' : 'Refresh now'}
      </button>
    </div>
  );
};

export default PwaUpdateBanner;
