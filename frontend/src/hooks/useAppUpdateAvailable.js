import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  fetchBackendRelease,
  fetchFrontendRelease,
  isCoordinatedReleaseReady,
} from '../services/releaseService';

const CHECK_INTERVAL_MS = 15 * 1000;

/**
 * Waits for frontend (Vercel) and backend (Hostinger) to report the same new git SHA
 * before showing the update banner — avoids reload prompts mid-deploy.
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
        `[Release] Coordinated update ready (${baselineRef.current.frontend} → ${frontend})`,
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

  const applyUpdate = async () => {
    if (swNeedRefresh) {
      await updateServiceWorker(true);
      return;
    }
    window.location.reload();
  };

  return { updateAvailable: coordinatedUpdate || swNeedRefresh, applyUpdate };
};
