import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  fetchBackendRelease,
  fetchFrontendRelease,
  getRunningBuildId,
  isCoordinatedReleaseReady,
} from '../services/releaseService';

const CHECK_INTERVAL_MS = 10 * 1000;

function isManualReload() {
  const [nav] = performance.getEntriesByType('navigation');
  return nav?.type === 'reload';
}

/**
 * One update banner per release — shown when a newer build is live on Vercel + Hostinger
 * but this tab is still running the older bundle in memory.
 */
export function useAppUpdateAvailable() {
  const runningBuildId = getRunningBuildId();
  const [coordinatedUpdate, setCoordinatedUpdate] = useState(false);

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
    const [frontend, backend] = await Promise.all([
      fetchFrontendRelease(),
      fetchBackendRelease(),
    ]);

    const ready = isCoordinatedReleaseReady(runningBuildId, { frontend, backend });
    setCoordinatedUpdate(ready);

    if (ready) {
      console.info(
        `[Release] Update ready (${runningBuildId.slice(0, 7)} → ${frontend?.slice(0, 7)}, backend aligned)`,
      );
    }
  }, [runningBuildId]);

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

  return { updateAvailable: coordinatedUpdate, applyUpdate };
};
