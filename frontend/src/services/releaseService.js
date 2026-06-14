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
 * Show banner only when the full deploy is done (Vercel + backend same SHA)
 * and this tab is still on an older build.
 */
export function isUpdateReady(runningBuildId, liveBackendRelease, liveFrontendRelease) {
  if (!runningBuildId || !liveBackendRelease || !liveFrontendRelease) return false;
  if (liveBackendRelease === runningBuildId) return false;

  // Vercel or Hostinger still catching up — not ready to prompt yet.
  if (liveFrontendRelease !== liveBackendRelease) return false;

  return true;
}
