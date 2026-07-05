/** Platform roles that must not be replaced when joining an agency. */
const PLATFORM_ROLES = new Set(['admin', 'qa', 'manager']);

function poolSegment(agencyId) {
  const id = agencyId == null || agencyId === '' ? null : String(agencyId).trim();
  return id || 'platform';
}

function normalizeAgencyId(value) {
  if (value == null || value === '') return null;
  return String(value).trim() || null;
}

/** Agency membership role (agency_agent | agency_admin), separate from platform role. */
function getAgencyMembershipRole(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.agencyRole === 'agency_admin' || doc.agencyRole === 'agency_agent') {
    return doc.agencyRole;
  }
  if (doc.role === 'agency_admin' || doc.role === 'agency_agent') return doc.role;
  return null;
}

function isPlatformRole(role) {
  return PLATFORM_ROLES.has(role);
}

function isAgencyRole(role) {
  return role === 'agency_admin' || role === 'agency_agent' || role === 'manager';
}

function isAgencyAdminRole(roleOrDoc) {
  if (roleOrDoc && typeof roleOrDoc === 'object') {
    return getAgencyMembershipRole(roleOrDoc) === 'agency_admin';
  }
  return roleOrDoc === 'agency_admin';
}

module.exports = {
  PLATFORM_ROLES,
  poolSegment,
  normalizeAgencyId,
  getAgencyMembershipRole,
  isPlatformRole,
  isAgencyRole,
  isAgencyAdminRole,
};
