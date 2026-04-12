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

const agentManager = require('../services/agentManager');
const phoneUtils = require('../utils/phoneUtils');

/**
 * Universal Vendor Ping API
 * Supports multiple formats for backward compatibility and partner integrations (Ringba/Trackdrive/TLDCRM).
 * 
 * Formats:
 * 1. GET /api/public/ping/:campaignId?state=TX (Legacy)
 * 2. GET /api/public/ping/:campaignId?phone=7025551212 (Query phone)
 * 3. GET /api/public/ping/:campaignId/:phone (Path phone)
 * 4. GET /api/public/ping/:campaignId/:token/:phone (TLDCRM style)
 */
async function handlePing(req, res) {
    try {
        const { campaignId, phone: pathPhone, token } = req.params;
        const { state: queryState, phone: queryPhone } = req.query;

        const phone = pathPhone || queryPhone;
        let state = queryState || null;

        // If state is not provided, derive it from the phone number area code
        if (phone && !state) {
            state = phoneUtils.getStateFromPhone(phone);
            if (state) {
                console.log(`[Public API] 📱 Derived state '${state}' from phone: ${phone}`);
            }
        }

        // Execute the fast snapshot (Soft Ping)
        const isAvailable = await agentManager.checkAvailableAgent(campaignId, state);

        console.log(`[Public API] 📡 Ping for '${campaignId}' | Phone: ${phone || 'N/A'} | State: ${state || 'ANY'} -> ${isAvailable ? 'AVAILABLE (1)' : 'BUSY (0)'}`);

        return res.json({
            status: isAvailable ? 1 : 0,
            campaign: campaignId,
            state: state || 'any',
            // Optional metadata for the caller
            ...(phone && { derived_state: state })
        });
    } catch (err) {
        console.error('[Public API] 📡 Ping Error:', err.message);
        return res.status(500).json({ status: 0, error: 'Internal Server Error' });
    }
}

// 1. Regular ping with query params
router.get('/ping/:campaignId', handlePing);

/**
 * TLDCRM / Ringba / Trackdrive Compatible Ping (Path-based)
 * Order matters in Express, so we put the most specific ones first if needed, 
 * but here :campaignId/:phone and :campaignId/:token/:phone are distinct enough.
 */

// 2. /api/public/ping/:campaignId/:phone
// Note: If this conflicts with other routes, ensure precise regex or ordering.
router.get('/ping/:campaignId/:phone', handlePing);

// 3. /api/public/ping/:campaignId/:token/:phone
router.get('/ping/:campaignId/:token/:phone', handlePing);

module.exports = router;
