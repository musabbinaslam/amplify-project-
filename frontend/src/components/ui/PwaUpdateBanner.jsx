import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import useDialerStore from '../../store/useDialerStore';
import classes from './PwaUpdateBanner.module.css';

const PwaUpdateBanner = () => {
  const callState = useDialerStore((s) => s.callState);
  const inCall = callState === 'ringing' || callState === 'active';

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  const handleRefresh = () => {
    updateServiceWorker(true);
  };

  return (
    <div className={classes.banner} role="alert" aria-live="polite">
      <p className={classes.text}>A new version of CallsFlow is ready.</p>
      <button
        type="button"
        className={classes.button}
        onClick={handleRefresh}
        disabled={inCall}
      >
        {inCall ? 'Refresh after your call' : 'Refresh now'}
      </button>
    </div>
  );
};

export default PwaUpdateBanner;
