const { normalizeAgencyId } = require('../utils/tenancy');

/** Reject cross-agency resource access when agencyId is present on the request. */
function assertAgencyScope(req, resourceAgencyId) {
  const viewerAgencyId = normalizeAgencyId(req.agencyId);
  if (req.agencyRole === 'admin') return true;
  const resourceId = normalizeAgencyId(resourceAgencyId);
  return viewerAgencyId === resourceId;
}

function scopeToAgency(req, res, next) {
  req.assertAgencyScope = (resourceAgencyId) => assertAgencyScope(req, resourceAgencyId);
  next();
}

module.exports = { scopeToAgency, assertAgencyScope };
