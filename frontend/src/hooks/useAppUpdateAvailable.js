import { useCallback, useEffect, useState } from 'react';
import {
  fetchBackendRelease,
  fetchFrontendRelease,
  getRunningBuildId,
  isUpdateReady,
} from '../services/releaseService';

const CHECK_INTERVAL_MS = 10 * 1000;

export function useAppUpdateAvailable() {
  const runningBuildId = getRunningBuildId();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (!runningBuildId) return;

    const [liveBackend, liveFrontend] = await Promise.all([
      fetchBackendRelease(),
      fetchFrontendRelease(),
    ]);
    const ready = isUpdateReady(runningBuildId, liveBackend, liveFrontend);
    setUpdateAvailable(ready);

    if (ready) {
      console.info('[Release] update ready', {
        running: runningBuildId.slice(0, 7),
        backend: liveBackend?.slice(0, 7),
        frontend: liveFrontend?.slice(0, 7),
      });
    }
  }, [runningBuildId]);

  useEffect(() => {
    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    const onFocus = () => checkForUpdate();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkForUpdate]);

  const applyUpdate = () => {
    window.location.reload();
  };

  return { updateAvailable, applyUpdate };
};
