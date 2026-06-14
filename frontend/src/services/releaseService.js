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
 * Show banner when backend reports a newer deploy than this tab's bundle.
 * Hide when this tab already has the latest frontend (Vercel ahead of backend stamp).
 */
export function isUpdateReady(runningBuildId, liveBackendRelease, liveFrontendRelease) {
  if (!runningBuildId || !liveBackendRelease) return false;
  if (liveBackendRelease === runningBuildId) return false;

  // Refreshed to latest Vercel build; backend stamp still catching up — not a user action.
  if (liveFrontendRelease && liveFrontendRelease === runningBuildId) {
    return false;
  }

  return true;
}
