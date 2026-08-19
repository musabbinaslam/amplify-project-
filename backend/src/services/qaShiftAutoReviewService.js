const agentManager = require('./agentManager');
const callLogService = require('./callLogService');
const qaComplianceRuleService = require('./qaComplianceRuleService');
const { notifyAdminsInBackground } = require('./notificationService');
const { runQaAudioReviewJob } = require('../queues/qaQueue');
const { tryAcquireQaAudioJob, releaseQaAudioJob, isQaAudioJobRunning } = require('../queues/qaRunLock');
const { redisClient } = require('../config/redis');

const ZERO_SINCE_KEY = 'qa:autoShift:zeroSince';
const RAN_KEY = 'qa:autoShift:ranForQuietPeriod';
const LAST_RUN_KEY = 'qa:autoShift:lastRunAt';

function envBool(name, fallback = true) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function startOfDayMs(timeZone = 'America/New_York') {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const y = get('year');
    const m = get('month');
    const d = get('day');
    const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
    const localAtNoon = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(noonUtc));
    const lg = (type) => Number(localAtNoon.find((p) => p.type === type)?.value);
    return noonUtc - (((lg('hour') * 3600) + (lg('minute') * 60) + lg('second')) * 1000);
  } catch {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
}

async function getLiveAgentCount() {
  const overview = await agentManager.getOverview(null);
  return Number(overview?.totalAgents || 0);
}

async function runShiftBatch() {
  const { isAiFlagsGeminiEnabled } = require('../queues/qaQueue');
  if (!isAiFlagsGeminiEnabled()) {
    console.warn('[QA AutoShift] Skipped — AI_FLAGS_GEMINI_ENABLED is off');
    return { started: false, reason: 'disabled' };
  }
  const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim());
  if (!geminiConfigured) {
    console.warn('[QA AutoShift] Skipped — GEMINI_API_KEY missing');
    return { started: false, reason: 'missing_key' };
  }

  const activeRules = await qaComplianceRuleService.listRules({ activeOnly: true });
  if (!Array.isArray(activeRules) || !activeRules.length) {
    console.warn('[QA AutoShift] Skipped — no active compliance rules');
    return { started: false, reason: 'no_rules' };
  }

  if (isQaAudioJobRunning() || !tryAcquireQaAudioJob('auto-shift')) {
    console.warn('[QA AutoShift] Skipped — another QA job is running');
    return { started: false, reason: 'busy' };
  }

  const batchLimit = Math.min(Math.max(envInt('QA_AUTO_BATCH_LIMIT', 40), 1), 100);
  const timezone = process.env.QA_SHIFT_TIMEZONE || 'America/New_York';
  const dayStart = startOfDayMs(timezone);
  const lastRunRaw = await redisClient.get(LAST_RUN_KEY).catch(() => null);
  const lastRunAt = lastRunRaw ? Number(lastRunRaw) : 0;
  const sinceMs = Math.max(dayStart, Number.isFinite(lastRunAt) ? lastRunAt : 0);

  try {
    const scan = await callLogService.collectQaAudioBackfillCandidates({
      limit: batchLimit,
      force: false,
      preferShort: false,
      sinceMs,
    });
    const queued = scan.candidates.length;
    console.log(
      `[QA AutoShift] Scanning done — queued=${queued} scannedLogs=${scan.scannedLogs} since=${new Date(sinceMs).toISOString()}`,
    );

    if (!queued) {
      await redisClient.set(LAST_RUN_KEY, String(Date.now()));
      await redisClient.set(RAN_KEY, '1');
      releaseQaAudioJob('auto-shift');
      return { started: false, reason: 'nothing_to_analyze', queued: 0 };
    }

    let pendingCreated = 0;
    let analyzed = 0;
    let billingStop = false;

    for (const savedLog of scan.candidates) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runQaAudioReviewJob({
        savedLog,
        agentId: savedLog.agentId,
        force: false,
      });
      analyzed += 1;
      const source = result?.source;
      const status = result?.status;
      if (status === 'pending_review') pendingCreated += 1;
      if (source === 'billing') {
        billingStop = true;
        console.warn('[QA AutoShift] Stopped early — Gemini billing/credits issue');
        break;
      }
      const waitMs = source === 'quota' ? 20000 : 5000;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    await redisClient.set(LAST_RUN_KEY, String(Date.now()));
    await redisClient.set(RAN_KEY, '1');

    const pendingTotal = await callLogService.countQaAudioReviews('pending_review').catch(() => pendingCreated);
    if (pendingTotal > 0 || pendingCreated > 0) {
      const count = pendingTotal || pendingCreated;
      notifyAdminsInBackground({
        title: 'AI QA flags need review',
        body: `${count} call${count === 1 ? '' : 's'} flagged after the shift went idle. Open AI Flags to confirm or dismiss.`,
        priority: 'high',
        linkPath: '/app/admin/ai-flags',
      }, 'qa-auto-shift');
      console.log(`[QA AutoShift] Notified admins — pending=${count}`);
    } else {
      console.log(`[QA AutoShift] Finished with no pending flags (analyzed=${analyzed})`);
    }

    return {
      started: true,
      queued,
      analyzed,
      pendingCreated,
      pendingTotal,
      billingStop,
    };
  } catch (err) {
    console.error('[QA AutoShift] Batch failed:', err.message);
    return { started: false, reason: err.message };
  } finally {
    releaseQaAudioJob('auto-shift');
  }
}

async function tickQaShiftAutoReview() {
  if (!envBool('QA_AUTO_SHIFT_ENABLED', true)) return;

  const idleMs = Math.max(envInt('QA_AUTO_SHIFT_IDLE_MS', 5 * 60 * 1000), 30_000);
  let live = 0;
  try {
    live = await getLiveAgentCount();
  } catch (err) {
    console.warn('[QA AutoShift] Could not read live agent count:', err.message);
    return;
  }

  if (live > 0) {
    await redisClient.del(ZERO_SINCE_KEY).catch(() => {});
    await redisClient.del(RAN_KEY).catch(() => {});
    return;
  }

  const alreadyRan = await redisClient.get(RAN_KEY).catch(() => null);
  if (alreadyRan === '1') return;

  const now = Date.now();
  let zeroSince = Number(await redisClient.get(ZERO_SINCE_KEY).catch(() => 0)) || 0;
  if (!zeroSince) {
    await redisClient.set(ZERO_SINCE_KEY, String(now));
    console.log('[QA AutoShift] Live agents hit 0 — starting 5-minute idle timer');
    return;
  }

  const idleFor = now - zeroSince;
  if (idleFor < idleMs) return;

  console.log(`[QA AutoShift] Live agents at 0 for ${Math.round(idleFor / 1000)}s — starting end-of-shift analysis`);
  setImmediate(() => {
    runShiftBatch()
      .then(async (result) => {
        if (result?.started || result?.reason === 'nothing_to_analyze') {
          await redisClient.set(RAN_KEY, '1');
        } else if (result?.reason === 'busy') {
          console.warn('[QA AutoShift] Will retry next poll — job busy');
        }
      })
      .catch((err) => {
        console.error('[QA AutoShift] Unhandled batch error:', err.message);
      });
  });
}

function startQaShiftAutoReviewScheduler() {
  const { isAiFlagsGeminiEnabled } = require('../queues/qaQueue');
  if (!isAiFlagsGeminiEnabled()) {
    console.log('[QA AutoShift] Disabled (AI_FLAGS_GEMINI_ENABLED is off)');
    return null;
  }
  if (!envBool('QA_AUTO_SHIFT_ENABLED', true)) {
    console.log('[QA AutoShift] Disabled (QA_AUTO_SHIFT_ENABLED=false)');
    return null;
  }
  const pollMs = Math.max(envInt('QA_AUTO_SHIFT_POLL_MS', 30_000), 10_000);
  const tz = process.env.QA_SHIFT_TIMEZONE || 'America/New_York';
  console.log(`[QA AutoShift] Watching live agents — trigger after 0 for ${Math.round(envInt('QA_AUTO_SHIFT_IDLE_MS', 5 * 60 * 1000) / 60000)} min (poll ${pollMs / 1000}s, day=${tz})`);
  const id = setInterval(() => {
    tickQaShiftAutoReview().catch((err) => {
      console.warn('[QA AutoShift] Tick failed:', err.message);
    });
  }, pollMs);
  // First tick shortly after boot (don't wait full poll).
  setTimeout(() => {
    tickQaShiftAutoReview().catch(() => {});
  }, 8_000);
  return id;
}

module.exports = {
  startQaShiftAutoReviewScheduler,
  tickQaShiftAutoReview,
  runShiftBatch,
};
