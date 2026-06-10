import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Detects new deployments via service worker (precached assets) and /version.json polling.
 * Either signal shows the update banner — polling catches open tabs that never navigated.
 */
export function useAppUpdateAvailable() {
  const [versionUpdate, setVersionUpdate] = useState(false);
  const buildIdRef = useRef(null);

  const {
    needRefresh: [swNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        setInterval(() => registration.update(), CHECK_INTERVAL_MS);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed:', error);
    },
  });

  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const newBuildId = data?.buildId;
        if (!newBuildId) return;

        if (buildIdRef.current === null) {
          buildIdRef.current = newBuildId;
        } else if (buildIdRef.current !== newBuildId) {
          setVersionUpdate(true);
        }
      } catch {
        // Network hiccup — try again next interval
      }
    }

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const updateAvailable = swNeedRefresh || versionUpdate;

  const applyUpdate = async () => {
    if (swNeedRefresh) {
      await updateServiceWorker(true);
      return;
    }
    window.location.reload();
  };

  return { updateAvailable, applyUpdate };
}
