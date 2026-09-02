const {
    generateQaInsight,
    generateQaAudioReview,
    classifyGeminiError,
    isQaInsightGeminiEnabled,
    isAiFlagsGeminiEnabled,
} = require('../services/qaInsightService');
const callLogService = require('../services/callLogService');
const qaComplianceRuleService = require('../services/qaComplianceRuleService');
const { getAiFlagsEligibility } = require('../utils/aiFlagsEligibility');
const { notifyAdminsInBackground } = require('../services/notificationService');

async function runWithRetry(label, callId, fn, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[QA] ⚙️  ${label} attempt ${attempt}/${maxAttempts} — Call ${callId}`);
            return await fn();
        } catch (err) {
            const isLastAttempt = attempt === maxAttempts;
            if (isLastAttempt) {
                console.error(`[QA] ❌ ${label} failed after ${maxAttempts} attempts for Call ${callId}:`, err.message);
                throw err;
            }
            const delayMs = Number(err.retryAfterMs) > 0
                ? err.retryAfterMs
                : Math.pow(2, attempt - 1) * 1000;
            console.warn(`[QA] ⚠️  ${label} attempt ${attempt} failed (${err.message}). Retrying in ${Math.round(delayMs / 1000)}s...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    return null;
}

async function runQaInsightJob({ savedLog, agentId, FromState = null }, maxAttempts = 3) {
    const callId = savedLog?.id || 'unknown';
    if (!isQaInsightGeminiEnabled()) {
        console.log(`[QA] Skip insight for Call ${callId} — QA_INSIGHT_GEMINI_ENABLED is off`);
        return;
    }
    try {
        const qaInsight = await runWithRetry('insight', callId, async () => (
            generateQaInsight({
                ...savedLog,
                state: FromState,
            })
        ), maxAttempts);
        if (qaInsight) {
            await callLogService.attachQaInsight(agentId, callId, qaInsight);
            console.log(`[QA] ✅ Insight attached to Call ${callId}`);
        }
    } catch (err) {
        console.error(`[QA] Insight job aborted for Call ${callId}:`, err.message);
    }
}

async function runQaAudioReviewJob({ savedLog, agentId, FromState = null, force = false }, maxAttempts = 3) {
    const callId = savedLog?.id || 'unknown';
    if (!isAiFlagsGeminiEnabled()) {
        console.log(`[AI Flags] Skip audio review for Call ${callId} — AI Flags is off`);
        return { status: 'clear', source: 'disabled' };
    }
    if (!savedLog?.id || !agentId) return;
    const skipCallStatuses = new Set(['busy', 'failed', 'no-answer', 'no_answer', 'canceled', 'cancelled', 'missed']);
    if (savedLog.status && skipCallStatuses.has(String(savedLog.status).toLowerCase())) {
        console.log(`[AI Flags] Skip audio review for ${savedLog.status} call ${callId}`);
        return;
    }

    const skipStatuses = ['pending_review', 'confirmed', 'dismissed', 'processing'];
    const existing = savedLog.qaAudioReview?.status;
    if (!force && existing && skipStatuses.includes(existing)) {
        console.log(`[AI Flags] Skip audio review for Call ${callId} — already ${existing}`);
        return;
    }

    const eligibility = getAiFlagsEligibility({
        campaign: savedLog.campaign,
        duration: savedLog.duration,
        force,
    });
    if (!eligibility.eligible) {
        const { window, durationSec, reason } = eligibility;
        console.log(
            `[AI Flags] Skip Call ${callId} — ${reason} `
            + `(duration=${durationSec}s, window=${window.minSec}–${window.maxSec}s, `
            + `buffer=${window.buffer}s, campaign=${savedLog.campaign || 'unknown'})`,
        );
        return { status: 'skipped', source: reason, window };
    }

    try {
        const claimed = await callLogService.claimQaAudioReview(agentId, callId, { force });
        if (!claimed) {
            console.log(`[AI Flags] Skip audio review for Call ${callId} — already claimed`);
            return;
        }

        const freshLog = await callLogService.getCallLog(agentId, callId);
        const log = { ...savedLog, ...(freshLog || {}) };
        const rules = await qaComplianceRuleService.listActiveRulesForCampaign(log.campaign);
        const qaAudioReview = await runWithRetry('audio', callId, async () => (
            generateQaAudioReview({
                ...log,
                state: FromState,
            }, rules)
        ), maxAttempts);

        if (qaAudioReview) {
            await callLogService.attachQaAudioReview(agentId, callId, qaAudioReview);
            console.log(`[AI Flags] ✅ Audio review attached to Call ${callId} status=${qaAudioReview.status} source=${qaAudioReview.source}`);
            if (qaAudioReview.status === 'pending_review') {
                const campaign = log.campaignLabel || log.campaign || 'call';
                const violations = Array.isArray(qaAudioReview.violations) ? qaAudioReview.violations : [];
                const firstRule = violations[0]?.ruleName || violations[0]?.ruleId || '';
                const count = violations.length;
                const agentLabel = log.agentName || agentId;
                const durationSec = Number(log.duration);
                const durationBit = Number.isFinite(durationSec) ? `${Math.round(durationSec)}s` : 'unknown duration';
                notifyAdminsInBackground({
                    type: 'ai_flag',
                    title: `AI flag · ${campaign}`,
                    body: count
                        ? `${agentLabel} · ${durationBit} · ${firstRule || `${count} violation${count === 1 ? '' : 's'}`}`
                        : `${agentLabel} · ${durationBit} · flagged for review`,
                    priority: 'high',
                    linkPath: '/app/admin/ai-flags',
                }, 'qa-audio-review');
            }
        }
        return qaAudioReview || null;
    } catch (err) {
        const kind = classifyGeminiError(err.message);
        const source = err.qaSource || kind || 'fallback';
        console.error(`[AI Flags] Audio job aborted for Call ${callId}:`, err.message);
        try {
            await callLogService.attachQaAudioReview(agentId, callId, {
                status: 'clear',
                transcript: '',
                summary: `Audio analysis failed: ${err.message}`,
                violations: [],
                model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
                source,
                version: 'qa-audio-v1',
            });
        } catch (writeErr) {
            console.error(`[AI Flags] Failed to write audio fallback for Call ${callId}:`, writeErr.message);
        }
        return { source, status: 'clear' };
    }
}

function dispatchQaInsightJob(jobData) {
    if (!isQaInsightGeminiEnabled()) {
        console.log('[QA] Skip insight dispatch — QA_INSIGHT_GEMINI_ENABLED is off');
        return;
    }
    runQaInsightJob(jobData).catch((err) => {
        console.error('[QA] Unhandled error in QA insight runner:', err.message);
    });
}

function dispatchQaAudioReviewJob(jobData) {
    if (!isAiFlagsGeminiEnabled()) {
        console.log('[AI Flags] Skip audio dispatch — AI Flags is off');
        return;
    }
    runQaAudioReviewJob(jobData).catch((err) => {
        console.error('[AI Flags] Unhandled error in audio runner:', err.message);
    });
}

module.exports = {
    dispatchQaInsightJob,
    dispatchQaAudioReviewJob,
    runQaAudioReviewJob,
    isQaInsightGeminiEnabled,
    isAiFlagsGeminiEnabled,
};
