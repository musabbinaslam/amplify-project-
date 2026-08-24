const { CAMPAIGN_CONFIG } = require('../config/pricing');

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Per-campaign AI Flags duration window: buffer + extraMin … buffer + extraMax.
 * Unknown campaigns fall back to buffer 0 (default 10–15s) with a warning.
 */
function getAiFlagsDurationWindow(campaignId) {
  const id = String(campaignId || '').trim();
  const known = Boolean(id && Object.prototype.hasOwnProperty.call(CAMPAIGN_CONFIG, id));
  if (id && !known) {
    console.warn(`[AI Flags] Unknown campaign "${id}" — using buffer 0 (window defaults to +10–+15s)`);
  }
  const buffer = known ? (Number(CAMPAIGN_CONFIG[id].buffer) || 0) : 0;
  const extraMin = Math.max(0, envInt('AI_FLAGS_BUFFER_EXTRA_MIN_SEC', 10));
  const extraMax = Math.max(extraMin, envInt('AI_FLAGS_BUFFER_EXTRA_MAX_SEC', 15));
  return {
    buffer,
    minSec: buffer + extraMin,
    maxSec: buffer + extraMax,
    campaignKnown: !id || known,
    extraMin,
    extraMax,
  };
}

/**
 * @returns {{ eligible: boolean, reason: string|null, window: object, durationSec: number }}
 */
function getAiFlagsEligibility({ campaign, duration, force = false } = {}) {
  const window = getAiFlagsDurationWindow(campaign);
  const durationSec = Number(duration) || 0;
  if (force) {
    return { eligible: true, reason: null, window, durationSec };
  }
  if (durationSec < window.minSec) {
    return { eligible: false, reason: 'below_buffer_window', window, durationSec };
  }
  if (durationSec > window.maxSec) {
    return { eligible: false, reason: 'above_buffer_window', window, durationSec };
  }
  return { eligible: true, reason: null, window, durationSec };
}

module.exports = {
  getAiFlagsDurationWindow,
  getAiFlagsEligibility,
};
