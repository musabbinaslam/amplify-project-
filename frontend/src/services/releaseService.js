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
 * When to show the update banner:
 * - Frontend has a new deploy, AND
 * - Full-stack deploy: backend caught up to the same SHA, OR
 * - Frontend-only deploy: backend unchanged (still valid)
 *
 * Hides the banner mid-deploy when frontend is new but backend is still on the old SHA.
 */
export function isCoordinatedReleaseReady(baseline, remote) {
  if (!baseline?.frontend || !remote?.frontend) return false;

  const frontendUpdated = remote.frontend !== baseline.frontend;
  if (!frontendUpdated) return false;

  // Backend not configured yet (returns unknown) — still prompt for frontend deploys
  if (!remote.backend) return true;

  if (!baseline.backend) return remote.frontend === remote.backend;

  if (remote.frontend === remote.backend) return true;

  if (remote.backend === baseline.backend) return true;

  return false;
}
