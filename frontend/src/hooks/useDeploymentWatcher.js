import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

/**
 * Silently watches for new deployments by polling /version.json every 5 minutes.
 *
 * Strategy: "Reload on next route change"
 *   - When a new buildId is detected, we set a flag but do NOT reload immediately.
 *   - The moment the user navigates to any new route, we reload then.
 *   - Since they're already expecting a page transition, the reload is invisible.
 *
 * Setup: your build script must write dist/version.json on every deploy:
 *   echo '{"buildId":"'$(git rev-parse --short HEAD)'"}' > dist/version.json
 *   (The frontend/package.json build script already does this for Vercel.)
 */
export function useDeploymentWatcher() {
  const location = useLocation();
  const currentBuildId = useRef(null);
  const updatePending = useRef(false);
  const lastPath = useRef(location.pathname);

  // ── Poll for new builds ──────────────────────────────────────────────────
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const newBuildId = data?.buildId;
        if (!newBuildId) return;

        if (currentBuildId.current === null) {
          currentBuildId.current = newBuildId; // Record initial build on boot
        } else if (currentBuildId.current !== newBuildId) {
          console.info(`[DeploymentWatcher] New build detected (${currentBuildId.current} → ${newBuildId}). Will reload on next navigation.`);
          updatePending.current = true;
        }
      } catch {
        // Network hiccup — try again next interval
      }
    }

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ── Reload on next route change ──────────────────────────────────────────
  useEffect(() => {
    // Skip the initial mount (lastPath === currentPath on first render)
    if (location.pathname === lastPath.current) return;
    lastPath.current = location.pathname;

    if (updatePending.current) {
      // User just navigated — reload now. They won't notice since
      // they were already expecting a new page to load.
      window.location.reload();
    }
  }, [location.pathname]);
}

