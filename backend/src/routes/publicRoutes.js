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

/**
 * Universal Vendor Ping API
 * Format: /api/public/ping/:campaignId?state=TX
 * Returns: { "status": 1 } if agent available, else { "status": 0 }
 */
const agentManager = require('../services/agentManager');

router.get('/ping/:campaignId', async (req, res) => {
    try {
        const campaignId = req.params.campaignId;
        const state = req.query.state || null; // Optional physical state query param
        
        // Execute the fast snapshot (Soft Ping)
        const isAvailable = await agentManager.checkAvailableAgent(campaignId, state);
        
        console.log(`[Public API] 📡 Ping from Buyer for '${campaignId}' | State: ${state || 'ANY'} -> ${isAvailable ? 'AVAILABLE (1)' : 'BUSY (0)'}`);
        
        return res.json({
            status: isAvailable ? 1 : 0,
            campaign: campaignId,
            state: state || 'any'
        });
    } catch (err) {
        console.error('[Public API] 📡 Ping Error:', err.message);
        return res.status(500).json({ status: 0, error: 'Internal Server Error' });
    }
});

module.exports = router;
