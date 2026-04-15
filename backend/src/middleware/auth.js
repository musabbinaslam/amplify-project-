const admin = require('../config/firebaseAdmin');

const verifyFirebaseToken = async (req, res, next) => {
  if (!admin) {
    return res.status(503).json({ error: 'Auth service unavailable (missing service account)' });
  }

  const authHeader = req.headers.authorization;
  // Also accept token as query param — needed for native <audio> streaming
  // which cannot send custom headers for Range requests.
  const queryToken = req.query.token;

  let idToken = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    idToken = authHeader.split('Bearer ')[1];
  } else if (queryToken) {
    idToken = queryToken;
  } else {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email,
    };
    next();
  } catch (err) {
    console.error('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { verifyFirebaseToken };
