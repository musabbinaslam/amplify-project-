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

const BACKEND_WAIT_MS = 2 * 60 * 1000;

/**
 * Show banner when a newer frontend deploy is live.
 * Waits up to 2 min for backend to match (full-stack deploy), then shows anyway.
 */
export function isUpdateReady(runningBuildId, remote, { swPending = false, frontendNewSince = null } = {}) {
  if (!runningBuildId || !remote?.frontend) return false;

  const newerDeployLive = remote.frontend !== runningBuildId;
  if (!newerDeployLive) return false;

  if (swPending) return true;

  if (!remote.backend) return true;

  if (remote.frontend === remote.backend) return true;

  if (frontendNewSince && Date.now() - frontendNewSince >= BACKEND_WAIT_MS) {
    return true;
  }

  return false;
}
