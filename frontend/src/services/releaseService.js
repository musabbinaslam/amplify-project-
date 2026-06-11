import { getApiBaseUrl } from '../config/apiBase';

/** Commit SHA compiled into this JS bundle (see vite.config.js). */
export function getRunningBuildId() {
  return import.meta.env.VITE_APP_BUILD_ID || 'dev';
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
 * Show the banner when a newer deploy is live AND backend has caught up.
 * Compares live /version.json to the build id in this bundle — not the first poll.
 */
export function isCoordinatedReleaseReady(runningBuildId, remote) {
  if (!runningBuildId || !remote?.frontend) return false;

  const newerDeployLive = remote.frontend !== runningBuildId;
  if (!newerDeployLive) return false;

  if (!remote.backend) return false;

  return remote.frontend === remote.backend;
}
