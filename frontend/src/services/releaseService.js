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

export async function fetchBackendRelease() {
  const res = await fetch(`${getApiBaseUrl()}/api/public/release?t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return parseReleasePayload(data);
}

/** Show banner when the live backend release differs from this tab's build. */
export function isUpdateReady(runningBuildId, liveBackendRelease) {
  if (!runningBuildId || !liveBackendRelease) return false;
  return liveBackendRelease !== runningBuildId;
}
