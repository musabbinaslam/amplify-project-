const { getUserDoc } = require('../services/userDataService');

/**
 * After verifyFirebaseToken. Requires Firestore users/{uid}.role === 'admin' or 'support'.
 */
async function requireSupportOrAdmin(req, res, next) {
  try {
    const doc = await getUserDoc(req.user.uid);
    const role = doc?.role;
    if (role !== 'admin' && role !== 'support') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.supportRole = role;
    req.userDoc = doc || null;
    if (req.user) req.user.role = role;
    next();
  } catch (err) {
    console.error('[requireSupportOrAdmin]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to verify role' });
  }
}

function isSupportStaffRole(role) {
  return role === 'admin' || role === 'support';
}

module.exports = { requireSupportOrAdmin, isSupportStaffRole };
