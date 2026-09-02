const { getUserDoc } = require('../services/userDataService');

/**
 * After verifyFirebaseToken. Requires Firestore users/{uid}.role === 'admin' or 'qa'.
 * Used for /api/qa endpoints that QA reviewers or admins can access.
 */
async function requireQaOrAdmin(req, res, next) {
  try {
    const doc = await getUserDoc(req.user.uid);
    const role = doc?.role;
    if (role !== 'admin' && role !== 'qa') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch (err) {
    console.error('[requireQaOrAdmin]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to verify role' });
  }
}

module.exports = { requireQaOrAdmin };
