const { Queue, Worker } = require('bullmq');
const { ioredisConnection } = require('../config/bullmq');
const { generateQaInsight } = require('../services/qaInsightService');
const callLogService = require('../services/callLogService');

const QUEUE_NAME = 'qaInsightQueue';

// Instantiating the queue
const qaInsightQueue = new Queue(QUEUE_NAME, {
    connection: ioredisConnection,
});

// Instantiating the worker
const qaInsightWorker = new Worker(QUEUE_NAME, async (job) => {
    const { savedLog, agentId, FromState = null } = job.data;

    console.log(`[BullMQ] ⚙️ Processing QA Insight for Agent ${agentId} - Call ${savedLog.id}...`);

    try {
        const qaInsight = await generateQaInsight({
            ...savedLog,
            state: FromState,
        });

        await callLogService.attachQaInsight(agentId, savedLog.id, qaInsight);
        
        console.log(`[BullMQ] ✅ QA Insight successfully attached to Call ${savedLog.id}`);
        return qaInsight;

    } catch (err) {
         console.error(`[BullMQ] ❌ QA Insight failure for Call ${savedLog.id}:`, err.message);
         throw err; // Trigger retry
    }
}, {
    connection: ioredisConnection,
    concurrency: 5, // Process up to 5 QA insights concurrently
});

qaInsightWorker.on('failed', (job, err) => {
    console.error(`[BullMQ] Job ${job.id} has definitively failed: ${err.message}`);
});

module.exports = {
    qaInsightQueue,
    qaInsightWorker
};
