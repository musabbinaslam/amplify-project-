import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  fetchBackendRelease,
  fetchFrontendRelease,
  getRunningBuildId,
  isUpdateReady,
} from '../services/releaseService';

const CHECK_INTERVAL_MS = 10 * 1000;

function isManualReload() {
  const [nav] = performance.getEntriesByType('navigation');
  return nav?.type === 'reload';
}

export function useAppUpdateAvailable() {
  const runningBuildId = getRunningBuildId();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const {
    needRefresh: [swNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => registration.update(), CHECK_INTERVAL_MS);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed:', error);
    },
  });

  const evaluateRelease = useCallback(async () => {
    if (!runningBuildId) return;

    const [frontend, backend] = await Promise.all([
      fetchFrontendRelease(),
      fetchBackendRelease(),
    ]);

    const ready = isUpdateReady(
      runningBuildId,
      { frontend, backend },
      { swPending: swNeedRefresh },
    );
    setUpdateAvailable(ready);

    if (ready) {
      console.info('[Release] update ready', {
        running: runningBuildId.slice(0, 7),
        live: frontend?.slice(0, 7),
        backend: backend?.slice(0, 7),
      });
    }
  }, [runningBuildId, swNeedRefresh]);

  useEffect(() => {
    evaluateRelease();
    const interval = setInterval(evaluateRelease, CHECK_INTERVAL_MS);

    const onFocus = () => evaluateRelease();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [evaluateRelease]);

  useEffect(() => {
    if (swNeedRefresh) evaluateRelease();
  }, [swNeedRefresh, evaluateRelease]);

  useEffect(() => {
    if (!isManualReload()) return;

    let cancelled = false;
    navigator.serviceWorker?.ready.then((registration) => {
      if (cancelled || !registration.waiting) return;
      updateServiceWorker(true);
    });

    return () => {
      cancelled = true;
    };
  }, [updateServiceWorker]);

  const applyUpdate = async () => {
    if (swNeedRefresh) {
      await updateServiceWorker(true);
      return;
    }
    window.location.reload();
  };

  return { updateAvailable, applyUpdate };
};
