const PLATFORM_ROLES = new Set(['admin', 'qa', 'manager', 'support']);

function isPlatformUser(user) {
  return Boolean(user?.role && PLATFORM_ROLES.has(user.role));
}

/** True when the user's agency blocks Take Calls / invite ops. */
export function isAgencyGated(user) {
  if (!user?.agencyId) return false;
  // Platform dual-hat: staff keep full app access; API still enforces tenancy.
  if (isPlatformUser(user)) return false;
  // Fail closed when membership exists but status hasn't loaded yet.
  if (!user.agencyStatus) return true;
  return user.agencyStatus === 'pending'
    || user.agencyStatus === 'rejected'
    || user.agencyStatus === 'suspended';
}

/**
 * App lockdown to status + profile + support.
 * Founders under pending/rejected/suspended; agents when suspended.
 * Platform roles never enter lockdown.
 */
export function isAgencyReviewLockdown(user) {
  if (!isAgencyGated(user)) return false;
  if (user.role === 'agency_admin' || user.agencyRole === 'agency_admin') return true;
  // Suspended agents: freeze non–Take Calls surfaces the same way.
  if (user.agencyStatus === 'suspended') {
    return user.role === 'agency_agent'
      || user.agencyRole === 'agency_agent'
      || Boolean(user.agencyId);
  }
  return false;
}

/** Paths still reachable during agency review lockdown. */
export function isAgencyReviewAllowedPath(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  if (p === '/app') return true;
  if (p === '/app/profile') return true;
  // Exact support user routes only — do not match /app/support-desk
  if (p === '/app/support' || p === '/app/support/email') return true;
  return false;
}

export const AGENCY_POST_AUTH_RETRY_KEY = 'agency_post_auth_retry';
