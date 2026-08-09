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

export function isAgencySignupPending(user) {
  return user?.agencySignupStatus === 'pending';
}

export function isAgencySignupRejected(user) {
  return user?.agencySignupStatus === 'rejected';
}

/** Pending or rejected agency applicants are gated from the normal app. */
export function isAgencySignupGated(user) {
  return isAgencySignupPending(user) || isAgencySignupRejected(user);
}
