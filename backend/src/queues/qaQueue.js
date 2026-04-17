const { generateQaInsight } = require('../services/qaInsightService');
const callLogService = require('../services/callLogService');

/**
 * Runs QA insight generation fully in-process with exponential backoff retries.
 * No Redis / BullMQ required — the job runs as a detached async task after call completion.
 *
 * @param {object} savedLog   - The persisted call log object (must have .id)
 * @param {string} agentId    - Firebase UID of the agent
 * @param {string|null} FromState - Caller state derived from Twilio (e.g. 'TX')
 * @param {number} maxAttempts - Max retry attempts (default: 3)
 */
async function runQaInsightJob({ savedLog, agentId, FromState = null }, maxAttempts = 3) {
    const callId = savedLog?.id || 'unknown';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[QA] ⚙️  Attempt ${attempt}/${maxAttempts} — generating insight for Call ${callId} (Agent: ${agentId})`);

            const qaInsight = await generateQaInsight({
                ...savedLog,
                state: FromState,
            });

            await callLogService.attachQaInsight(agentId, callId, qaInsight);
            console.log(`[QA] ✅ Insight attached to Call ${callId} on attempt ${attempt}`);
            return; // success — stop retrying

        } catch (err) {
            const isLastAttempt = attempt === maxAttempts;
            if (isLastAttempt) {
                console.error(`[QA] ❌ All ${maxAttempts} attempts failed for Call ${callId}:`, err.message);
                return;
            }

            // Exponential backoff: 1s, 2s, 4s ...
            const delayMs = Math.pow(2, attempt - 1) * 1000;
            console.warn(`[QA] ⚠️  Attempt ${attempt} failed (${err.message}). Retrying in ${delayMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}

/**
 * Dispatches a QA insight job in the background.
 * Returns immediately — never blocks the HTTP response.
 */
function dispatchQaInsightJob(jobData) {
    // Fire-and-forget: deliberately NOT awaited
    runQaInsightJob(jobData).catch((err) => {
        console.error('[QA] Unhandled error in QA insight runner:', err.message);
    });
}

module.exports = { dispatchQaInsightJob };
