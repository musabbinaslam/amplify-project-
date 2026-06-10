import { getApiBaseUrl } from '../config/apiBase';

function parseReleasePayload(data) {
  return data?.releaseId || data?.buildId || null;
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
 * Show the update banner only when both services report the same NEW release.
 * Avoids prompting while Hostinger and Vercel are still on different commits mid-deploy.
 */
export function isCoordinatedReleaseReady(baseline, remote) {
  if (!baseline?.frontend || !baseline?.backend || !remote?.frontend || !remote?.backend) {
    return false;
  }

  const aligned = remote.frontend === remote.backend;
  const frontendMoved = remote.frontend !== baseline.frontend;

  return aligned && frontendMoved;
}
