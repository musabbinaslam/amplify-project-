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
 * Show banner when a newer deploy is live and backend has caught up (same SHA).
 * If backend release is unreachable, still prompt when live frontend is newer.
 */
export function isUpdateReady(runningBuildId, remote, { swPending = false } = {}) {
  if (!runningBuildId || !remote?.frontend) return false;

  const newerDeployLive = remote.frontend !== runningBuildId;
  if (!newerDeployLive) return false;

  if (!remote.backend) {
    return swPending || true;
  }

  if (remote.frontend === remote.backend) return true;

  return false;
}
