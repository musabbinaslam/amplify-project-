const { getUserDoc } = require('../services/userDataService');

/**
 * After verifyFirebaseToken. Requires Firestore users/{uid}.role === 'manager' or 'admin'.
 *
 * Also attaches the manager's agent allowlist to the request so every downstream
 * handler can scope its results:
 *   - req.managedAgents === null  → admin (no scoping, may see everything)
 *   - req.managedAgents === [...] → manager (may ONLY see these agent UIDs)
 */
async function requireManager(req, res, next) {
  try {
    const doc = await getUserDoc(req.user.uid);
    const role = doc?.role;
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.managerRole = role;
    // Admins are unrestricted; managers are limited to their explicit allowlist.
    req.managedAgents = role === 'admin'
      ? null
      : (Array.isArray(doc?.managedAgents) ? doc.managedAgents.filter(Boolean) : []);
    next();
  } catch (err) {
    console.error('[requireManager]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to verify role' });
  }
}

module.exports = { requireManager };
