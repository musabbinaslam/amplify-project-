import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchFrontendRelease,
  getRunningBuildId,
  isUpdateReady,
} from '../services/releaseService';

const CHECK_INTERVAL_MS = 60 * 1000;

export function useAppUpdateAvailable() {
  const runningBuildId = getRunningBuildId();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialDeployRef = useRef(null);
  const lastCheckRef = useRef(0);

  const checkForUpdate = useCallback(async () => {
    if (!runningBuildId) return;
    if (Date.now() - lastCheckRef.current < CHECK_INTERVAL_MS) return;
    lastCheckRef.current = Date.now();

    const liveFrontend = await fetchFrontendRelease();

    if (!initialDeployRef.current) {
      initialDeployRef.current = {
        frontend: liveFrontend,
        wasBehindOnLoad:
          Boolean(liveFrontend) && liveFrontend !== runningBuildId,
      };
    }

    const ready = isUpdateReady(runningBuildId, liveFrontend, {
      initialFrontend: initialDeployRef.current.frontend,
      wasBehindOnLoad: initialDeployRef.current.wasBehindOnLoad,
    });
    setUpdateAvailable(ready);

    if (ready) {
      console.info('[Release] update ready', {
        running: runningBuildId.slice(0, 7),
        live: liveFrontend?.slice(0, 7),
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
