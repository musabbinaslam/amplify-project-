const express = require('express');
const { getReleaseId, writeReleaseId } = require('../utils/releaseId');

const { expandOrigins } = require('../utils/corsOrigins');

const router = express.Router();
const metaConversionService = require('../services/metaConversionService');
const allowedFirebaseConfigOrigins = expandOrigins(
  (process.env.FIREBASE_CONFIG_ALLOWED_ORIGINS || process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function getRequestOrigin(req) {
  const originHeader = req.headers.origin ? String(req.headers.origin).trim() : '';
  if (originHeader) return originHeader;
  const refererHeader = req.headers.referer ? String(req.headers.referer).trim() : '';
  if (!refererHeader) return '';
  try {
    return new URL(refererHeader).origin;
  } catch {
    return '';
  }
}

/**
 * Deploy release id — compared by the frontend against VITE_APP_BUILD_ID.
 */
router.get('/release', (req, res) => {
  const releaseId = getReleaseId();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ buildId: releaseId, releaseId });
});

/**
 * GitHub Actions stamps .release over HTTPS (reliable — no SSH from CI).
 * Set RELEASE_STAMP_TOKEN on the server; same value in GitHub secrets.
 */
router.post('/release/stamp', (req, res) => {
  const expected = String(process.env.RELEASE_STAMP_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({ error: 'Release stamp not configured' });
  }

  const headerToken = String(req.headers['x-release-stamp-token'] || '').trim();
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const token = headerToken || bearer;
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const releaseId = req.body?.releaseId || req.body?.buildId;
  try {
    const written = writeReleaseId(releaseId);
    res.json({ ok: true, buildId: written, releaseId: written });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid release id' });
  }
});

/**
 * Public Firebase web SDK config (same values as Firebase console Web app).
 * Not a secret; kept on server so the frontend repo does not need VITE_FIREBASE_*.
 */
router.get('/firebase-config', (req, res) => {
  // Optional hardening: only serve Firebase web config to approved frontend origins.
  if (allowedFirebaseConfigOrigins.length) {
    const requestOrigin = getRequestOrigin(req);
    if (!requestOrigin || !allowedFirebaseConfigOrigins.includes(requestOrigin)) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.FIREBASE_APP_ID;
  const measurementId = process.env.FIREBASE_MEASUREMENT_ID;

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
    measurementId: measurementId || '',
  });
});

const agentManager = require('../services/agentManager');
const phoneUtils = require('../utils/phoneUtils');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const { isCampaignPaused, getCampaignControls } = require('../services/notificationService');

/**
 * Public campaign pricing catalog.
 * Returns the canonical list of campaigns with pricing and buffers so the
 * frontend dashboard can render them without hardcoding values.
 */
router.get('/campaigns', async (req, res) => {
  try {
    const controls = await getCampaignControls();
    const pausedMap = controls?.campaigns || {};
    const campaigns = Object.entries(CAMPAIGN_CONFIG)
      .filter(([, cfg]) => !cfg.locked || !cfg.agencyId)
      .map(([id, cfg]) => ({
      id,
      label: cfg.label,
      price: cfg.price,
      buffer: cfg.buffer,
      paused: Boolean(pausedMap[id]?.paused),
      pauseReason: pausedMap[id]?.reason || '',
    }));
    res.json({ campaigns });
  } catch (err) {
    console.error('[Public API] campaigns error:', err.message);
    res.status(500).json({ error: 'Failed to load campaigns' });
  }
});

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
    const { state: queryState, phone: queryPhone, agencyId } = req.query;

    const rawPhone = pathPhone || queryPhone;

    // Sanitize: strip non-digits and require at least 10 digits.
    // Catches empty Ringba placeholders like "phone_number=" or "phone_number=undefined".
    const phoneDigits = String(rawPhone || '').replace(/\D/g, '');
    const phone = phoneDigits.length >= 10 ? rawPhone : null;

    let state = queryState || null;

    // If state is not provided, derive it from the phone number area code
    if (phone && !state) {
      state = phoneUtils.getStateFromPhone(phone);
      if (state) {
        console.log(`[Public API] 📱 Derived state '${state}' from phone: ${phone}`);
      }
    }

    // Block pings with no valid phone AND no explicit state.
    // Without a state we cannot verify agent licensing, so returning AVAILABLE
    // would cause Ringba to route callers that no agent is licensed to handle.
    if (!phone && !state) {
      console.log(`[Public API] 📡 Ping for '${campaignId}' blocked — no valid phone or state (raw: ${rawPhone || 'N/A'})`);
      return res.json({
        status: 0,
        campaign: campaignId,
        state: 'any',
        reason: 'no_state',
      });
    }

    // Execute the fast snapshot (Soft Ping)
    if (await isCampaignPaused(campaignId)) {
      console.log(`[Public API] 📡 Ping for '${campaignId}' blocked — campaign is paused`);
      return res.json({
        status: 0,
        campaign: campaignId,
        state: state || 'any',
        paused: true,
        ...(phone && { derived_state: state })
      });
    }
    const isAvailable = await agentManager.checkAvailableAgent(campaignId, state, { agencyId });

    console.log(`[Public API] 📡 Ping for '${campaignId}' | Agency: ${agencyId || 'platform'} | Phone: ${phone || 'N/A'} | State: ${state || 'ANY'} -> ${isAvailable ? 'AVAILABLE (1)' : 'BUSY (0)'}`);

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

/**
 * Universal Vendor Confirm API — Two-Phase Reservation (Option B)
 *
 * Ringba calls this endpoint immediately before dialing the lead (after winning the bid).
 * We atomically lock a specific agent here and store a 30-second reservation keyed by
 * the caller's phone number. When the real Twilio call arrives seconds later, the inbound
 * handler picks up the pre-locked agent and routes instantly.
 *
 * If no agent can be locked, we return status:0 and Ringba fails over to the next
 * buyer — the call is never dialed to Twilio, so the publisher is never billed.
 *
 * Supports the same URL patterns as the ping for drop-in compatibility:
 *   GET /api/public/confirm/:campaignId
 *   GET /api/public/confirm/:campaignId/:phone
 *   GET /api/public/confirm/:campaignId/:token/:phone
 *
 * Response: { status: 1 } = accept (agent reserved)
 *           { status: 0 } = reject (no agent, Ringba should failover)
 */
async function handleConfirm(req, res) {
   try {
      const { campaignId, phone: pathPhone } = req.params;
      const { state: queryState, phone: queryPhone, agencyId } = req.query;

      const phone = pathPhone || queryPhone || null;
      let state = queryState || null;

      // Derive state from phone area code if not provided
      if (phone && !state) {
         state = phoneUtils.getStateFromPhone(phone);
         if (state) {
            console.log(`[Confirm API] 📱 Derived state '${state}' from phone: ${phone}`);
         }
      }

      // Reject immediately if campaign is paused
      if (await isCampaignPaused(campaignId)) {
         console.log(`[Confirm API] 🚫 Confirm for '${campaignId}' blocked — campaign is paused`);
         return res.json({ status: 0, campaign: campaignId, paused: true });
      }

      // Attempt atomic reservation
      const agent = await agentManager.reserveAgentForCall(campaignId, phone, state, { agencyId });

      const accepted = Boolean(agent);
      console.log(
         `[Confirm API] ${accepted ? '✅ ACCEPT' : '❌ REJECT'} campaign='${campaignId}' agency=${agencyId || 'platform'} phone=${phone || 'N/A'} state=${state || 'ANY'}${accepted ? ` → agent=${agent.id}` : ''}`
      );

      return res.json({
         status: accepted ? 1 : 0,
         campaign: campaignId,
         state: state || 'any',
         ...(phone && { derived_state: state }),
      });
   } catch (err) {
      console.error('[Confirm API] ❌ Error:', err.message);
      // Fail closed — return 0 so Ringba fails over rather than blindly dialing
      return res.status(500).json({ status: 0, error: 'Internal Server Error' });
   }
}

// Confirm route registrations — mirror the ping URL patterns exactly
router.get('/confirm/:campaignId', handleConfirm);
router.get('/confirm/:campaignId/:phone', handleConfirm);
router.get('/confirm/:campaignId/:token/:phone', handleConfirm);

/**
 * Server-side Meta Conversions API event for successful signup.
 * Body (minimal): { eventId, email, phone, fullName, eventSourceUrl }
 */
router.post('/meta/complete-registration', async (req, res) => {
  try {
    const { eventId, email, phone, fullName, eventSourceUrl } = req.body || {};
    if (!email && !phone) {
      return res.status(400).json({ error: 'At least email or phone is required' });
    }

    const result = await metaConversionService.sendCompleteRegistration({
      eventId,
      email,
      phone,
      fullName,
      eventSourceUrl,
      clientUserAgent: req.headers['user-agent'] || '',
      clientIpAddress: req.ip || req.headers['x-forwarded-for'] || '',
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Public API] meta complete-registration error:', err.message);
    return res.status(500).json({ error: 'Failed to send Meta conversion event' });
  }
});

module.exports = router;
