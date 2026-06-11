import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  fetchBackendRelease,
  fetchFrontendRelease,
  isCoordinatedReleaseReady,
} from '../services/releaseService';

const CHECK_INTERVAL_MS = 15 * 1000;

function isManualReload() {
  const [nav] = performance.getEntriesByType('navigation');
  return nav?.type === 'reload';
}

/**
 * One update banner per release — shown only when Vercel + Hostinger report the same SHA.
 * Service worker updates are applied on refresh / "Refresh now", not as a separate prompt.
 */
export function useAppUpdateAvailable() {
  const baselineRef = useRef(null);
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

    if (!frontend) return;

    if (baselineRef.current === null) {
      baselineRef.current = { frontend, backend: backend || null };
      return;
    }

    const ready = isCoordinatedReleaseReady(baselineRef.current, { frontend, backend });
    setCoordinatedUpdate(ready);

    if (ready) {
      console.info(
        `[Release] Update ready (${baselineRef.current.frontend.slice(0, 7)} → ${frontend.slice(0, 7)}, backend aligned)`,
      );
    }
  }, []);

  useEffect(() => {
    evaluateRelease();
    const interval = setInterval(evaluateRelease, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
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

  // Single signal — do not also prompt on swNeedRefresh (that caused a 2nd banner on every deploy).
  return { updateAvailable: coordinatedUpdate, applyUpdate };
};
