const { getUserDoc } = require('../services/userDataService');
const { normalizeAgencyId, isAgencyAdminRole, getAgencyMembershipRole } = require('../utils/tenancy');

/**
 * After verifyFirebaseToken. Requires manager, agency_admin, or platform admin.
 *
 * Attaches scoping for downstream handlers:
 *   - req.managedAgents === null + req.agencyId set → agency admin (all agency members)
 *   - req.managedAgents === null + no agencyId → platform admin (all users)
 *   - req.managedAgents === [...] → legacy manager allowlist
 */
async function requireManager(req, res, next) {
  try {
    const doc = await getUserDoc(req.user.uid);
    const role = doc?.role;

    if (role === 'admin') {
      req.managerRole = role;
      req.agencyId = null;
      req.managedAgents = null;
      return next();
    }

    // Platform team managers use managedAgents allowlist — not agency admin tenancy.
    if (role === 'manager' && !getAgencyMembershipRole(doc)) {
      req.managerRole = role;
      req.agencyId = normalizeAgencyId(doc?.agencyId);
      req.managedAgents = Array.isArray(doc?.managedAgents) ? doc.managedAgents.filter(Boolean) : [];
      req.teamName = typeof doc?.teamName === 'string' ? doc.teamName.trim() || null : null;
      return next();
    }

    if (isAgencyAdminRole(doc)) {
      const agencyId = normalizeAgencyId(doc?.agencyId);
      if (!agencyId) {
        return res.status(403).json({ error: 'Agency admin is not assigned to an agency' });
      }
      req.managerRole = getAgencyMembershipRole(doc) || doc.role;
      req.agencyId = agencyId;
      req.managedAgents = null;
      return next();
    }

    if (role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.managerRole = role;
    req.agencyId = normalizeAgencyId(doc?.agencyId);
    req.managedAgents = Array.isArray(doc?.managedAgents) ? doc.managedAgents.filter(Boolean) : [];
    next();
  } catch (err) {
    console.error('[requireManager]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to verify role' });
  }
}

module.exports = { requireManager };
