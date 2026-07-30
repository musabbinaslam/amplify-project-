/** Normalize agency membership role from profile (supports legacy role field). */
export function normalizeAgencyRole(profile) {
  if (!profile) return null;
  if (profile.agencyRole === 'agency_admin' || profile.agencyRole === 'agency_agent') {
    return profile.agencyRole;
  }
  if (profile.role === 'agency_admin' || profile.role === 'agency_agent') {
    return profile.role;
  }
  return null;
}

/** User can administer an agency (sidebar link, /app/agency route). */
export function isAgencyAdminUser(user) {
  if (!user) return false;
  return user.role === 'agency_admin' || user.agencyRole === 'agency_admin';
}

/**
 * Get a specific agency white-label setting for the current user.
 *
 * If the user belongs to an agency (has agencyId) but the settings haven't
 * loaded yet (agencySettings === null), we default to TRUE (restricted).
 * This prevents a brief flash of hidden content appearing on login.
 *
 * Agency admins are never restricted regardless of settings.
 *
 * @param {object} user - the user object from authStore
 * @param {'hideWallet'|'hideBilling'|'hidePricing'|'allowAdminFunding'} key
 * @returns {boolean}
 */
export function getAgencySetting(user, key) {
  // Agency admins always bypass restrictions
  if (isAgencyAdminUser(user)) return false;
  // No agency → no restrictions
  if (!user?.agencyId) return false;
  // Has agency but settings not loaded yet → default to restricted to avoid flash
  if (user.agencySettings === null || user.agencySettings === undefined) return true;
  return user.agencySettings[key] === true;
}
