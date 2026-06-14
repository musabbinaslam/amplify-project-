import { getApiBaseUrl } from '../config/apiBase';

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

export async function fetchBackendRelease() {
  const res = await fetch(`${getApiBaseUrl()}/api/public/release?t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return parseReleasePayload(data);
}

/**
 * Show banner when Vercel + backend are aligned on a deploy this tab does not have yet.
 * Requires either a new deploy since the tab opened, or the tab was already behind on load.
 */
export function isUpdateReady(
  runningBuildId,
  liveBackendRelease,
  liveFrontendRelease,
  { initialBackend, initialFrontend, wasBehindOnLoad } = {},
) {
  if (!runningBuildId || !liveBackendRelease || !liveFrontendRelease) return false;
  if (liveBackendRelease !== liveFrontendRelease) return false;
  if (liveBackendRelease === runningBuildId) return false;

  const deployMoved =
    initialBackend != null &&
    (liveBackendRelease !== initialBackend || liveFrontendRelease !== initialFrontend);

  return deployMoved || Boolean(wasBehindOnLoad);
}
