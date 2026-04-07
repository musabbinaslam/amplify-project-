const { getUserDoc } = require('../services/userDataService');

/**
 * After verifyFirebaseToken. Requires Firestore users/{uid}.role === 'admin'.
 */
async function requireAdmin(req, res, next) {
  try {
    const doc = await getUserDoc(req.user.uid);
    if (doc?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch (err) {
    console.error('[requireAdmin]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to verify admin' });
  }
}

module.exports = { requireAdmin };
