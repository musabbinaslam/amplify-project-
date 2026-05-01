import { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

/**
 * Polls /version.json on the server every 5 minutes.
 * If the buildId changes (i.e. a new deployment was pushed), it hard-reloads
 * the page so the user automatically gets the new bundle without seeing
 * the "Failed to fetch dynamically imported module" crash.
 *
 * Setup: your CI/CD pipeline must write `public/version.json` with:
 *   { "buildId": "<git-sha-or-timestamp>" }
 *
 * Example (in your deploy script / Vite plugin):
 *   echo '{"buildId":"'$(git rev-parse --short HEAD)'"}' > dist/version.json
 */
export function useDeploymentWatcher() {
  const currentBuildId = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function checkVersion() {
      try {
        // Cache-bust so we always get the latest version.json
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return; // Server doesn't have version.json yet — skip silently

        const data = await res.json();
        const newBuildId = data?.buildId;
        if (!newBuildId) return;

        if (currentBuildId.current === null) {
          // First check — record what we booted with
          currentBuildId.current = newBuildId;
        } else if (currentBuildId.current !== newBuildId && mounted) {
          // Build ID changed — a new deployment is live
          console.info(`[DeploymentWatcher] New build detected (${currentBuildId.current} → ${newBuildId}). Reloading...`);
          window.location.reload();
        }
      } catch {
        // Network error or JSON parse failure — fail silently, try next interval
      }
    }

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);
}
