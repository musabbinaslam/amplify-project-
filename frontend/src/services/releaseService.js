/** Commit SHA compiled into this JS bundle (see vite.config.js). */
export function getRunningBuildId() {
  const id = import.meta.env.VITE_APP_BUILD_ID;
  if (!id || id === 'dev') return null;
  return id;
}

function parseReleasePayload(data) {
  const id = data?.releaseId || data?.buildId || null;
  if (!id || id === 'unknown' || id === 'dev') return null;
  return id;
}

export async function fetchFrontendRelease() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return parseReleasePayload(data);
}

/**
 * Show banner when Vercel has a newer deploy than this tab's bundle.
 * Requires a new frontend deploy since the tab opened (or already behind on load).
 */
export function isUpdateReady(
  runningBuildId,
  liveFrontendRelease,
  { initialFrontend, wasBehindOnLoad } = {},
) {
  if (!runningBuildId || !liveFrontendRelease) return false;
  if (liveFrontendRelease === runningBuildId) return false;

  const deployMoved =
    initialFrontend != null && liveFrontendRelease !== initialFrontend;

  return deployMoved || Boolean(wasBehindOnLoad);
}
