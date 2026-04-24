/**
 * Referral Program Configuration
 *
 * All reward rules, thresholds, and limits live here.
 * Never hardcode percentages or amounts elsewhere —
 * import this module instead so UI and logic never drift.
 */

const REFERRAL_CONFIG = {
  // ── Code Generation ────────────────────────────────────────────────
  codePrefix: 'AGENT',          // prefix before the random part
  codeLength: 6,                // random alphanumeric chars after prefix

  // ── Reward ─────────────────────────────────────────────────────────
  discountPercent: 20,          // referrer gets 20% off their next purchase
  discountExpiryDays: 90,       // days from "goes live" date until discount expires
  referrerRewardCents: 0,       // reserved for future dual-sided rewards
  discountMultiplier: 1.0,      // multiply discountPercent for campaigns (e.g. 1.5 → 30%)

  // ── Qualifying Thresholds ──────────────────────────────────────────
  minQualifyingSpendCents: 5000,        // $50 — matches smallest top-up tier
  minGoLiveCallDurationSec: 30,         // "goes live" = first completed call ≥ 30s
  discountAppliesTo: ['credit_topup'],  // future: add 'subscription'

  // ── Anti-Abuse ─────────────────────────────────────────────────────
  maxReferralsPerUser: 100,             // cap how many people one user can refer
  resolveRateLimitPerMinute: 10,        // rate limit on /resolve/:code
};

/**
 * Human-readable share text template.
 * Placeholders: {{code}}, {{url}}
 */
const SHARE_TEXT_TEMPLATE =
  "I've been using CallsFlow for inbound insurance calls — sign up with my code {{code}} and help me earn a {{percent}}% discount! {{url}}";

/**
 * Base URL for referral links. Reads from env or defaults to production.
 */
const REFERRAL_BASE_URL = process.env.CLIENT_URL || 'https://callsflow.io';

module.exports = { REFERRAL_CONFIG, SHARE_TEXT_TEMPLATE, REFERRAL_BASE_URL };
