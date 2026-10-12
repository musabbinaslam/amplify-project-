const { getUserDoc } = require('../services/userDataService');
const { normalizeAgencyId, isAgencyAdminRole, getAgencyMembershipRole } = require('../utils/tenancy');

/**
 * Requires agency_admin or platform admin.
 * Sets req.agencyId for agency admins; null for platform admin viewing all.
 */
async function requireAgencyAdmin(req, res, next) {
  try {
    const doc = await getUserDoc(req.user.uid);
    const role = doc?.role;

    if (role === 'admin') {
      // Platform admins always pass as admin (requireActiveAgency skips them).
      // Optional ?agencyId= / body.agencyId scopes the request without demoting role.
      const explicitAgencyId = normalizeAgencyId(req.query.agencyId || req.body?.agencyId);
      req.agencyRole = 'admin';
      req.agencyId = explicitAgencyId || null;
      req.managedAgents = null;
      return next();
    }

    if (!isAgencyAdminRole(doc)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const agencyId = normalizeAgencyId(doc?.agencyId);
    if (!agencyId) {
      return res.status(403).json({ error: 'Agency admin is not assigned to an agency' });
    }

    req.agencyRole = getAgencyMembershipRole(doc) || doc.role;
    req.agencyId = agencyId;
    req.managedAgents = null;
    next();
  } catch (err) {
    console.error('[requireAgencyAdmin]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to verify role' });
  }
}

module.exports = { requireAgencyAdmin };
