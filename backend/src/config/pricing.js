/**
 * Official Campaign Pricing & Duration Buffers
 *
 * This module provides a live, Firestore-backed campaign config.
 * The CAMPAIGN_CONFIG object is mutated in-place on every Firestore update,
 * so all existing consumers automatically get the latest data with no refactoring.
 *
 * Call syncPricingConfig() once at server startup to attach the live listener.
 *
 * Rules:
 * - Buffer: Minimum seconds required for the call to be considered 'Billable'
 * - Price: The cost deducted from the agent's wallet when the buffer is met
 */

// ── Default (seed) values ─────────────────────────────────────────────────────
// These are the fallback values used before Firestore data is loaded.
// If Firestore has a system/pricing document, it will overwrite these at startup.
const CAMPAIGN_CONFIG = {
  // FE (Final Expense)
  fe_inbounds_short: {
    label: 'FE Inbounds Short Duration',
    buffer: 10,
    price: 25.00,
  },
  fe_tv_calls: {
    label: 'FE TV Calls',
    buffer: 30,
    price: 65.00,
  },
  // Medicare
  medicare_transfers: {
    label: 'Medicare Transfers',
    buffer: 120,
    price: 25.00,
  },
  medicare_inbound_1: {
    label: 'Medicare Inbounds (1)',
    buffer: 90,
    price: 35.00,
  },
  medicare_inbound_2: {
    label: 'Medicare Inbounds (2)',
    buffer: 15,
    price: 15.00,
  },
  // ACA
  aca_transfers: {
    label: 'ACA Transfers',
    buffer: 120,
    price: 30.00,
  },
};

// ── Live sync from Firestore ──────────────────────────────────────────────────
let _unsubscribe = null;

/**
 * Attaches a Firestore onSnapshot listener to `system/pricing`.
 * On every update, CAMPAIGN_CONFIG is mutated in-place so all existing
 * require() consumers receive the new values without restarting.
 * Returns a promise that resolves once the first snapshot is received.
 */
function syncPricingConfig() {
  return new Promise((resolve, reject) => {
    try {
      const { getDb } = require('./firestoreDb');
      const db = getDb();
      if (!db) {
        console.warn('[Pricing] Firestore unavailable — using hardcoded campaign defaults.');
        resolve();
        return;
      }

      let resolved = false;

      _unsubscribe = db.collection('system').doc('pricing').onSnapshot(
        (snap) => {
          if (snap.exists) {
            const data = snap.data();
            const campaigns = data?.campaigns || {};

            // ── SAFE: purely additive sync ────────────────────────────────────
            // We only ADD or UPDATE campaigns that exist in Firestore.
            // We NEVER delete entries from CAMPAIGN_CONFIG based on a snapshot.
            // Reason: if the Firestore document is ever partial or temporarily
            // corrupted, existing campaigns must continue routing calls correctly.
            // Deletions are not supported via the UI and won't happen in normal use.
            Object.keys(campaigns).forEach((id) => {
              const c = campaigns[id];
              if (!c || typeof c !== 'object') return; // skip malformed entries
              CAMPAIGN_CONFIG[id] = {
                label: String(c.label || id),
                buffer: Number(c.buffer) || 0,
                price: Number(c.price) || 0,
              };
            });

            console.log(`[Pricing] ✅ Live config synced — ${Object.keys(CAMPAIGN_CONFIG).length} campaigns loaded.`);

          } else {
            // Document doesn't exist yet — seed it with the defaults
            console.log('[Pricing] system/pricing document not found — writing defaults to Firestore.');
            const defaultCampaigns = {};
            Object.keys(CAMPAIGN_CONFIG).forEach((id) => {
              defaultCampaigns[id] = { ...CAMPAIGN_CONFIG[id] };
            });
            snap.ref.set({ campaigns: defaultCampaigns }).catch((err) => {
              console.error('[Pricing] Failed to seed default campaigns:', err.message);
            });
          }

          if (!resolved) {
            resolved = true;
            resolve();
          }
        },
        (err) => {
          console.error('[Pricing] Firestore listener error:', err.message);
          if (!resolved) {
            resolved = true;
            resolve(); // don't block startup on a listener error
          }
        }
      );
    } catch (err) {
      console.error('[Pricing] syncPricingConfig failed:', err.message);
      resolve();
    }
  });
}

/**
 * Cleanly detach the Firestore listener (e.g., in tests or graceful shutdown).
 */
function stopPricingSync() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

module.exports = { CAMPAIGN_CONFIG, syncPricingConfig, stopPricingSync };

