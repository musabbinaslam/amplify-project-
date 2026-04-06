const express = require('express');

const router = express.Router();

/**
 * Public Firebase web SDK config (same values as Firebase console Web app).
 * Not a secret; kept on server so the frontend repo does not need VITE_FIREBASE_*.
 */
router.get('/firebase-config', (req, res) => {
  const apiKey = process.env.FIREBASE_API_KEY;
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return res.status(503).json({
      error: 'Firebase web config is not configured on the server (set FIREBASE_* env vars).',
    });
  }

  res.json({
    apiKey,
    authDomain,
    projectId,
    storageBucket: storageBucket || '',
    messagingSenderId: messagingSenderId || '',
    appId,
  });
});

module.exports = router;
