const agencyService = require('../services/agencyService');
const { normalizeAgencyId } = require('../utils/tenancy');

/**
 * Block non-active agency ops for agency-tenant callers.
 *
 * Mount after requireAgencyAdmin / requireManager:
 * - Platform admins (agencyRole/managerRole === 'admin') pass through
 * - Platform team managers (managedAgents allowlist) pass through
 * - Agency admins must have an operable (active) agency
 *
 * Keep GET /api/agency/me outside this middleware so pending founders can read status.
 */
async function requireActiveAgency(req, res, next) {
  try {
    if (req.agencyRole === 'admin' || req.managerRole === 'admin') {
      return next();
    }
    // Platform managers scoped by managedAgents — not agency tenancy.
    if (Array.isArray(req.managedAgents)) {
      return next();
    }

    const agencyId = normalizeAgencyId(req.agencyId);
    if (!agencyId) {
      return res.status(403).json({ error: 'No agency assigned' });
    }

    const agency = await agencyService.getAgencyById(agencyId);
    if (!agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    if (!agencyService.isAgencyOperable(agency)) {
      const status = agency.status || 'unknown';
      return res.status(403).json({
        error: status === 'pending'
          ? 'Agency is pending approval'
          : status === 'rejected'
            ? 'Agency application was rejected'
            : 'Agency is not active',
        agencyStatus: status,
      });
    }

    req.agencyDoc = agency;
    return next();
  } catch (err) {
    console.error('[requireActiveAgency]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to verify agency status' });
  }
}

module.exports = { requireActiveAgency };
