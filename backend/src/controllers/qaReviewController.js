const callLogService = require('../services/callLogService');
const qaComplianceRuleService = require('../services/qaComplianceRuleService');
const { flagAgentAccount } = require('../services/agentFlagService');
const { getUserDoc } = require('../services/userDataService');
const { runQaAudioReviewJob, isAiFlagsGeminiEnabled } = require('../queues/qaQueue');
const { parseRecordingSid, isMockCallLog } = require('../utils/recordingSid');
const { tryAcquireQaAudioJob, releaseQaAudioJob } = require('../queues/qaRunLock');

function serviceErrorStatus(err) {
  const map = {
    NOT_FOUND: 404,
    INVALID_RULE: 400,
    UNAVAILABLE: 503,
    AGENT_REQUIRED: 400,
    INVALID_STATUS: 409,
  };
  return map[err?.code] || 500;
}

async function enrichReviewsWithAgentNames(rows) {
  const ids = [...new Set(rows.map((r) => r.agentId).filter(Boolean))];
  const meta = new Map();
  await Promise.all(ids.map(async (uid) => {
    try {
      const doc = await getUserDoc(uid);
      meta.set(uid, {
        agentName: doc?.name || doc?.displayName || doc?.email || uid,
        email: doc?.email || null,
        flagged: doc?.flagged === true,
      });
    } catch {
      meta.set(uid, { agentName: uid, email: null, flagged: false });
    }
  }));
  return rows.map((row) => ({
    ...row,
    agentName: meta.get(row.agentId)?.agentName || row.agentId,
    agentEmail: meta.get(row.agentId)?.email || null,
    agentFlagged: meta.get(row.agentId)?.flagged === true,
  }));
}

async function listQaReviews(req, res) {
  try {
    const status = String(req.query.status || 'pending_review').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = Math.max(0, Number(req.query.offset ?? ((page - 1) * limit)));
    const out = await callLogService.listQaAudioReviews({ status, limit, offset });
    const reviews = await enrichReviewsWithAgentNames(out.reviews || []);
    const pageSize = out.pageSize || limit;
    const total = out.total || reviews.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const currentPage = Math.min(page, totalPages);
    res.json({
      reviews,
      count: reviews.length,
      status,
      page: currentPage,
      pageSize,
      offset: out.offset ?? offset,
      total,
      totalPages,
      hasMore: Boolean(out.hasMore),
    });
  } catch (err) {
    console.error('[QA] listQaReviews:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load QA reviews' });
  }
}

async function countPendingQaReviews(req, res) {
  try {
    const count = await callLogService.countQaAudioReviews('pending_review');
    res.json({ pending: count });
  } catch (err) {
    console.error('[QA] countPendingQaReviews:', err.message);
    res.status(500).json({ error: 'Failed to count pending QA reviews' });
  }
}

async function getQaPipelineStatus(req, res) {
  try {
    const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim());
    const aiFlagsGeminiEnabled = isAiFlagsGeminiEnabled();
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const [activeRules, pipeline] = await Promise.all([
      qaComplianceRuleService.listRules({ activeOnly: true }),
      callLogService.getQaAudioPipelineStatus(),
    ]);
    const activeRuleCount = Array.isArray(activeRules) ? activeRules.length : 0;
    const lastSource = pipeline.lastReview?.source || '';
    let state = 'idle';
    if (!aiFlagsGeminiEnabled) state = 'disabled';
    else if (!geminiConfigured) state = 'missing_key';
    else if (!activeRuleCount) state = 'no_rules';
    else if ((pipeline.counts?.processing || 0) > 0) state = 'analyzing';
    else if (lastSource === 'billing') state = 'billing';
    else if (lastSource === 'quota') state = 'quota';
    else if (lastSource === 'fallback') state = 'fallback';
    else if (pipeline.lastGeminiAt) state = 'working';

    res.json({
      state,
      aiFlagsGeminiEnabled,
      geminiConfigured,
      model,
      activeRuleCount,
      counts: pipeline.counts,
      lastReview: pipeline.lastReview,
      lastGeminiAt: pipeline.lastGeminiAt,
    });
  } catch (err) {
    console.error('[QA] getQaPipelineStatus:', err.message);
    res.status(500).json({ error: 'Failed to load AI status' });
  }
}

async function reviewCall(req, res, nextStatus) {
  try {
    const agentId = String(req.params.agentId || req.body?.agentId || '').trim();
    const callLogId = String(req.params.callLogId || req.body?.callLogId || '').trim();
    const note = String(req.body?.note || '').trim();
    if (!agentId || !callLogId) {
      return res.status(400).json({ error: 'agentId and callLogId are required' });
    }
    if (note.length < 10) {
      return res.status(400).json({ error: 'Note must be at least 10 characters' });
    }

    const log = await callLogService.getCallLog(agentId, callLogId);
    if (!log) return res.status(404).json({ error: 'Call log not found' });
    const current = log.qaAudioReview?.status;
    if (current !== 'pending_review') {
      return res.status(409).json({ error: `Review is not pending (status: ${current || 'missing'})` });
    }

    const reviewer = await getUserDoc(req.user?.uid);
    const reviewerRole = reviewer?.role || 'admin';

    await callLogService.attachQaAudioReview(agentId, callLogId, {
      ...log.qaAudioReview,
      status: nextStatus,
      review: {
        by: req.user?.uid || null,
        role: reviewerRole,
        at: new Date().toISOString(),
        note,
      },
    });

    let flagResult = null;
    if (nextStatus === 'confirmed') {
      const firstViolation = Array.isArray(log.qaAudioReview?.violations) ? log.qaAudioReview.violations[0] : null;
      const ruleName = firstViolation?.ruleName || 'compliance violation';
      const reason = `QA confirmed: ${ruleName}`;
      flagResult = await flagAgentAccount(agentId, {
        reason,
        flaggedBy: req.user?.uid || reviewerRole,
        message: `Your account was flagged after a QA review confirmed a call violation: ${ruleName}. Contact admin@callsflow.io.`,
        notificationBody: `QA confirmed a call violation (${ruleName}). Reviewer note: ${note}`,
      });
    }

    const updated = await callLogService.getCallLog(agentId, callLogId);
    res.json({
      success: true,
      status: nextStatus,
      callLogId,
      agentId,
      flagged: Boolean(flagResult?.flagged),
      alreadyFlagged: Boolean(flagResult?.alreadyFlagged),
      qaAudioReview: updated?.qaAudioReview || null,
    });
  } catch (err) {
    console.error(`[QA] reviewCall ${nextStatus}:`, err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to update QA review' });
  }
}

async function confirmQaReview(req, res) {
  return reviewCall(req, res, 'confirmed');
}

async function dismissQaReview(req, res) {
  return reviewCall(req, res, 'dismissed');
}

async function backfillQaAudioReviews(req, res) {
  if (!isAiFlagsGeminiEnabled()) {
    return res.status(503).json({ error: 'AI Flags Gemini is disabled. Set AI_FLAGS_GEMINI_ENABLED=true to re-enable.' });
  }
  if (!tryAcquireQaAudioJob('manual-backfill')) {
    return res.status(409).json({ error: 'A recording analysis job is already running' });
  }

  const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim());
  if (!geminiConfigured) {
    releaseQaAudioJob('manual-backfill');
    return res.status(400).json({ error: 'GEMINI_API_KEY is not set' });
  }

  try {
    const activeRules = await qaComplianceRuleService.listRules({ activeOnly: true });
    if (!Array.isArray(activeRules) || !activeRules.length) {
      releaseQaAudioJob('manual-backfill');
      return res.status(400).json({ error: 'Add an active compliance rule before analyzing recordings' });
    }

    const limit = Math.min(Math.max(Number(req.body?.limit || 25), 1), 100);
    const force = Boolean(req.body?.force);
    const fromClear = Boolean(req.body?.fromClear) || force;
    const uid = String(req.body?.uid || '').trim();
    const preferShort = req.body?.preferShort === true;
    let maxDurationSec = Number(req.body?.maxDurationSec);
    let minDurationSec = Number(req.body?.minDurationSec);
    if (!Number.isFinite(maxDurationSec) || maxDurationSec < 0) maxDurationSec = 0;
    if (!Number.isFinite(minDurationSec) || minDurationSec < 0) minDurationSec = 0;

    const scan = fromClear
      ? await callLogService.collectClearQaAudioReanalyzeCandidates({ limit })
      : await callLogService.collectQaAudioBackfillCandidates({
        limit,
        force,
        uid,
        maxDurationSec,
        minDurationSec,
        preferShort,
      });
    const queued = scan.candidates.length;
    if (!queued) {
      releaseQaAudioJob('manual-backfill');
      const rangeHint = [
        minDurationSec ? `≥${minDurationSec}s` : null,
        maxDurationSec ? `≤${maxDurationSec}s` : null,
      ].filter(Boolean).join(' and ');
      return res.json({
        started: false,
        queued: 0,
        scannedUsers: scan.scannedUsers,
        scannedLogs: scan.scannedLogs,
        skippedNoRecording: scan.skippedNoRecording,
        skippedAlreadyAnalyzed: scan.skippedAlreadyAnalyzed,
        skippedInFlight: scan.skippedInFlight,
        skippedTooLong: scan.skippedTooLong,
        skippedTooShort: scan.skippedTooShort,
        skippedMock: scan.skippedMock,
        skippedRecordingGone: scan.skippedRecordingGone,
        maxDurationSec: scan.maxDurationSec,
        minDurationSec: scan.minDurationSec,
        message: fromClear
          ? 'No Clear calls with a real Twilio recording to re-analyze. Open the Clear filter and confirm a real (non-mock) call is listed.'
          : rangeHint
            ? `No real Twilio recordings ${rangeHint} left to analyze. Place a longer live test call, then retry.`
            : 'No older real recordings left to analyze. New calls are still reviewed automatically.',
      });
    }

    const sample = scan.candidates[0];
    const rangeLabel = [
      minDurationSec ? `≥${minDurationSec}s` : null,
      maxDurationSec ? `≤${maxDurationSec}s` : null,
    ].filter(Boolean).join(', ');
    res.json({
      started: true,
      queued,
      scannedUsers: scan.scannedUsers,
      scannedLogs: scan.scannedLogs,
      skippedNoRecording: scan.skippedNoRecording,
      skippedAlreadyAnalyzed: scan.skippedAlreadyAnalyzed,
      skippedInFlight: scan.skippedInFlight,
      skippedTooLong: scan.skippedTooLong,
      skippedTooShort: scan.skippedTooShort,
      maxDurationSec: scan.maxDurationSec,
      minDurationSec: scan.minDurationSec,
      sampleDurationSec: Number(sample?.duration || 0),
      fromClear: Boolean(scan.fromClear),
      message: scan.fromClear
        ? `Re-analyzing ${queued} Clear call${queued === 1 ? '' : 's'} (≈${Number(sample?.duration || 0)}s).`
        : rangeLabel
          ? `Queued ${queued} recording${queued === 1 ? '' : 's'} (${rangeLabel}). First clip ≈${Number(sample?.duration || 0)}s.`
          : `Queued ${queued} recording${queued === 1 ? '' : 's'} (longest first ≈${Number(sample?.duration || 0)}s).`,
    });

    setImmediate(async () => {
      try {
        console.log(`[QA] Backfill started — ${queued} recording(s)${fromClear ? ' (from Clear)' : ''}`);
        for (const savedLog of scan.candidates) {
          const result = await runQaAudioReviewJob({
            savedLog,
            agentId: savedLog.agentId,
            force: force || fromClear,
          });
          const source = result?.source
            || (await callLogService.getCallLog(savedLog.agentId, savedLog.id))?.qaAudioReview?.source;
          if (source === 'billing') {
            console.warn('[QA] Backfill stopped — Gemini credits/billing depleted');
            break;
          }
          const waitMs = source === 'quota' ? 20000 : 4000;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        console.log('[QA] Backfill finished');
      } catch (err) {
        console.error('[QA] Backfill aborted:', err.message);
      } finally {
        releaseQaAudioJob('manual-backfill');
      }
    });
  } catch (err) {
    releaseQaAudioJob('manual-backfill');
    console.error('[QA] backfillQaAudioReviews:', err.message);
    res.status(500).json({ error: err.message || 'Failed to start recording backfill' });
  }
}

async function reanalyzeQaAudioReview(req, res) {
  if (!isAiFlagsGeminiEnabled()) {
    return res.status(503).json({ error: 'AI Flags Gemini is disabled. Set AI_FLAGS_GEMINI_ENABLED=true to re-enable.' });
  }
  const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim());
  if (!geminiConfigured) {
    return res.status(400).json({ error: 'GEMINI_API_KEY is not set' });
  }
  if (!tryAcquireQaAudioJob('manual-reanalyze')) {
    return res.status(409).json({ error: 'A recording analysis job is already running' });
  }

  try {
    const activeRules = await qaComplianceRuleService.listRules({ activeOnly: true });
    if (!Array.isArray(activeRules) || !activeRules.length) {
      releaseQaAudioJob('manual-reanalyze');
      return res.status(400).json({ error: 'Add an active compliance rule before analyzing recordings' });
    }

    const agentId = String(req.params.agentId || '').trim();
    const callLogId = String(req.params.callLogId || '').trim();
    if (!agentId || !callLogId) {
      releaseQaAudioJob('manual-reanalyze');
      return res.status(400).json({ error: 'agentId and callLogId are required' });
    }

    const log = await callLogService.getCallLog(agentId, callLogId);
    if (!log) {
      releaseQaAudioJob('manual-reanalyze');
      return res.status(404).json({ error: 'Call log not found' });
    }
    if (isMockCallLog({ ...log, id: callLogId })) {
      releaseQaAudioJob('manual-reanalyze');
      return res.status(400).json({ error: 'This is a seeded/mock call with no real Twilio recording' });
    }
    const recordingSid = parseRecordingSid(log.recordingSid || log.recordingUrl);
    if (!recordingSid) {
      releaseQaAudioJob('manual-reanalyze');
      return res.status(400).json({ error: 'This call has no recording to analyze' });
    }

    res.json({
      started: true,
      queued: 1,
      sampleDurationSec: Number(log.duration || 0),
      message: `Re-analyzing this Clear call (≈${Number(log.duration || 0)}s).`,
    });

    setImmediate(async () => {
      try {
        await runQaAudioReviewJob({
          savedLog: { ...log, id: callLogId, agentId, recordingSid },
          agentId,
          force: true,
        });
      } catch (err) {
        console.error('[QA] Single reanalyze aborted:', err.message);
      } finally {
        releaseQaAudioJob('manual-reanalyze');
      }
    });
  } catch (err) {
    releaseQaAudioJob('manual-reanalyze');
    console.error('[QA] reanalyzeQaAudioReview:', err.message);
    res.status(500).json({ error: err.message || 'Failed to re-analyze call' });
  }
}

async function reanalyzeQaAudioReviewBatch(req, res) {
  if (!isAiFlagsGeminiEnabled()) {
    return res.status(503).json({ error: 'AI Flags Gemini is disabled. Set AI_FLAGS_GEMINI_ENABLED=true to re-enable.' });
  }
  const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim());
  if (!geminiConfigured) {
    return res.status(400).json({ error: 'GEMINI_API_KEY is not set' });
  }
  if (!tryAcquireQaAudioJob('manual-reanalyze-batch')) {
    return res.status(409).json({ error: 'A recording analysis job is already running' });
  }

  try {
    const activeRules = await qaComplianceRuleService.listRules({ activeOnly: true });
    if (!Array.isArray(activeRules) || !activeRules.length) {
      releaseQaAudioJob('manual-reanalyze-batch');
      return res.status(400).json({ error: 'Add an active compliance rule before analyzing recordings' });
    }

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const seen = new Set();
    const items = [];
    for (const row of rawItems) {
      const agentId = String(row?.agentId || '').trim();
      const callLogId = String(row?.callLogId || row?.id || '').trim();
      if (!agentId || !callLogId) continue;
      const key = `${agentId}/${callLogId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ agentId, callLogId });
      if (items.length >= 25) break;
    }

    if (!items.length) {
      releaseQaAudioJob('manual-reanalyze-batch');
      return res.status(400).json({ error: 'Select at least one call to re-analyze' });
    }

    const candidates = [];
    const skipped = { missing: 0, mock: 0, noRecording: 0 };
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const log = await callLogService.getCallLog(item.agentId, item.callLogId);
      if (!log) {
        skipped.missing += 1;
        continue;
      }
      if (isMockCallLog({ ...log, id: item.callLogId })) {
        skipped.mock += 1;
        continue;
      }
      const recordingSid = parseRecordingSid(log.recordingSid || log.recordingUrl);
      if (!recordingSid) {
        skipped.noRecording += 1;
        continue;
      }
      candidates.push({
        ...log,
        id: item.callLogId,
        agentId: item.agentId,
        recordingSid,
      });
    }

    if (!candidates.length) {
      releaseQaAudioJob('manual-reanalyze-batch');
      return res.json({
        started: false,
        queued: 0,
        skipped,
        message: 'None of the selected calls have a real Twilio recording to analyze.',
      });
    }

    res.json({
      started: true,
      queued: candidates.length,
      skipped,
      sampleDurationSec: Number(candidates[0]?.duration || 0),
      message: `Re-analyzing ${candidates.length} selected call${candidates.length === 1 ? '' : 's'}.`,
    });

    setImmediate(async () => {
      try {
        console.log(`[QA] Batch reanalyze started — ${candidates.length} recording(s)`);
        for (const savedLog of candidates) {
          const result = await runQaAudioReviewJob({
            savedLog,
            agentId: savedLog.agentId,
            force: true,
          });
          const source = result?.source;
          if (source === 'billing') {
            console.warn('[QA] Batch reanalyze stopped — Gemini billing/credits issue');
            break;
          }
          const waitMs = source === 'quota' ? 20000 : 4000;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        console.log('[QA] Batch reanalyze finished');
      } catch (err) {
        console.error('[QA] Batch reanalyze aborted:', err.message);
      } finally {
        releaseQaAudioJob('manual-reanalyze-batch');
      }
    });
  } catch (err) {
    releaseQaAudioJob('manual-reanalyze-batch');
    console.error('[QA] reanalyzeQaAudioReviewBatch:', err.message);
    res.status(500).json({ error: err.message || 'Failed to re-analyze selected calls' });
  }
}

async function listQaRules(req, res) {
  try {
    const rules = await qaComplianceRuleService.listRules();
    res.json({ rules });
  } catch (err) {
    console.error('[QA] listQaRules:', err.message);
    res.status(500).json({ error: 'Failed to load compliance rules' });
  }
}

async function createQaRule(req, res) {
  try {
    const rule = await qaComplianceRuleService.createRule(req.body || {}, req.user?.uid);
    res.status(201).json({ rule });
  } catch (err) {
    console.error('[QA] createQaRule:', err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to create rule' });
  }
}

async function updateQaRule(req, res) {
  try {
    const rule = await qaComplianceRuleService.updateRule(req.params.ruleId, req.body || {}, req.user?.uid);
    res.json({ rule });
  } catch (err) {
    console.error('[QA] updateQaRule:', err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to update rule' });
  }
}

async function deleteQaRule(req, res) {
  try {
    const out = await qaComplianceRuleService.deleteRule(req.params.ruleId);
    res.json(out);
  } catch (err) {
    console.error('[QA] deleteQaRule:', err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to delete rule' });
  }
}

module.exports = {
  listQaReviews,
  countPendingQaReviews,
  getQaPipelineStatus,
  confirmQaReview,
  dismissQaReview,
  backfillQaAudioReviews,
  reanalyzeQaAudioReview,
  reanalyzeQaAudioReviewBatch,
  listQaRules,
  createQaRule,
  updateQaRule,
  deleteQaRule,
};
