const {
    generateQaInsight,
    generateQaAudioReview,
    classifyGeminiError,
    isQaInsightGeminiEnabled,
    isAiFlagsGeminiEnabled,
} = require('../services/qaInsightService');
const callLogService = require('../services/callLogService');
const qaComplianceRuleService = require('../services/qaComplianceRuleService');

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
        console.log(`[AI Flags] Skip audio review for Call ${callId} — AI_FLAGS_GEMINI_ENABLED is off`);
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
        console.log('[AI Flags] Skip audio dispatch — AI_FLAGS_GEMINI_ENABLED is off');
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
