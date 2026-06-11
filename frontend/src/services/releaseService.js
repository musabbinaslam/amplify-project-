import { getApiBaseUrl } from '../config/apiBase';

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
 * Show the banner only when frontend AND backend report the same NEW release id.
 * Never prompt while they disagree (frontend finished before backend, or vice versa).
 */
export function isCoordinatedReleaseReady(baseline, remote) {
  if (!baseline?.frontend || !remote?.frontend || !remote?.backend) return false;

  const frontendUpdated = remote.frontend !== baseline.frontend;
  if (!frontendUpdated) return false;

  return remote.frontend === remote.backend;
}
