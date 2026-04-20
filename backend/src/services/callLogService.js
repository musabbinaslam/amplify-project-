const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { CAMPAIGN_CONFIG } = require('../config/pricing');

class CallLogService {
    async upsertAdminDailyMetrics(log) {
        if (!admin) return;
        const db = getDb();
        const day = new Date().toISOString().slice(0, 10);
        const { FieldValue } = admin.firestore;
        const campaignId = log.campaign || 'unknown';
        const agentId = log.agentId || 'unknown';
        const payload = {
            day,
            updatedAt: FieldValue.serverTimestamp(),
            summary: {
                totalCalls: FieldValue.increment(1),
                answeredCalls: FieldValue.increment(log.status === 'completed' ? 1 : 0),
                missedCalls: FieldValue.increment(log.status === 'completed' ? 0 : 1),
                billableCalls: FieldValue.increment(log.isBillable ? 1 : 0),
                totalDuration: FieldValue.increment(Number(log.duration || 0)),
                totalCost: FieldValue.increment(Number(log.cost || 0)),
            },
            campaigns: {
                [campaignId]: {
                    calls: FieldValue.increment(1),
                    answeredCalls: FieldValue.increment(log.status === 'completed' ? 1 : 0),
                    billableCalls: FieldValue.increment(log.isBillable ? 1 : 0),
                    totalDuration: FieldValue.increment(Number(log.duration || 0)),
                    totalCost: FieldValue.increment(Number(log.cost || 0)),
                    campaignLabel: log.campaignLabel || campaignId,
                },
            },
            agents: {
                [agentId]: {
                    calls: FieldValue.increment(1),
                    answeredCalls: FieldValue.increment(log.status === 'completed' ? 1 : 0),
                    billableCalls: FieldValue.increment(log.isBillable ? 1 : 0),
                    totalDuration: FieldValue.increment(Number(log.duration || 0)),
                    totalCost: FieldValue.increment(Number(log.cost || 0)),
                },
            },
        };
        await db.collection('adminMetrics').doc('daily').collection('days').doc(day).set(payload, { merge: true });
    }
    /**
     * Records a completed call and saves it to Firestore under the agent's user document.
     */
    async logCall(data) {
        const { 
            from, 
            to, 
            duration, 
            campaignId, 
            agentId, 
            status, 
            callSid,
            recordingUrl
        } = data;

        const config = CAMPAIGN_CONFIG[campaignId] || { buffer: 0, price: 0 };
        const durationSec = parseInt(duration) || 0;
        
        const walletService = require('./walletService');

        // AUTOMATED BILLING LOGIC
        const isBillable = durationSec >= config.buffer && status === 'completed';
        const cost = isBillable ? config.price : 0;

        // Auto-deduct credits from wallet
        if (isBillable && cost > 0 && agentId) {
            try {
                await walletService.deductCredits(agentId, cost * 100, {
                   callSid, campaignId, campaignLabel: config.label || campaignId
                });
            } catch (err) {
                console.error("[Billing] Failed to deduct credits:", err.message);
                // Call will still be logged
            }
        }

        const newLog = {
            callSid,
            timestamp: new Date().toISOString(),
            from,
            to,
            duration: durationSec,
            campaign: campaignId,
            campaignLabel: config.label || campaignId,
            agentId,
            status,
            isBillable,
            cost,
            type: campaignId.includes('transfer') ? 'Transfer' : 'Inbound',
            recordingUrl: recordingUrl || null
        };

        console.log(`[Billing] 💸 Call ${callSid}: ${durationSec}s. Billable: ${isBillable} ($${cost})`);

        // Save to Firestore under the agent's user document
        if (admin && agentId) {
            try {
                const db = getDb();
                const callLogsRef = db.collection('users').doc(agentId).collection('callLogs');
                const docRef = await callLogsRef.add({
                    ...newLog,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                newLog.id = docRef.id;
                console.log(`[Firestore] ✅ Call log saved for user ${agentId}: ${docRef.id}`);
                await this.upsertAdminDailyMetrics(newLog);
            } catch (err) {
                console.error(`[Firestore] ❌ Failed to save call log for user ${agentId}:`, err.message);
                // Assign a fallback ID
                newLog.id = Date.now().toString();
            }
        } else {
            console.warn('[Firestore] ⚠️ Cannot save call log - Firebase Admin or agentId unavailable');
            newLog.id = Date.now().toString();
        }

        return newLog;
    }

    /**
     * Get call logs for a specific user from Firestore
     * @param {string} uid - Firebase UID of the user
     * @param {number} limit - Max number of logs to return
     */
    async getLogsByUser(uid, limit = 500, startDate = null, endDate = null) {
        if (!admin || !uid) return [];
        try {
            const db = getDb();
            let query = db
                .collection('users')
                .doc(uid)
                .collection('callLogs')
                .orderBy('createdAt', 'desc');

            if (startDate) query = query.where('createdAt', '>=', startDate);
            if (endDate) query = query.where('createdAt', '<=', endDate);

            const snap = await query.limit(limit).get();

            return snap.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Convert Firestore Timestamp to ISO string if present
                    createdAt: data.createdAt?.toDate?.()
                        ? data.createdAt.toDate().toISOString()
                        : data.createdAt,
                };
            });
        } catch (err) {
            console.error(`[Firestore] Failed to fetch call logs for user ${uid}:`, err.message);
            return [];
        }
    }

    async attachQaInsight(uid, callLogId, qaInsight) {
        if (!admin || !uid || !callLogId) return false;
        try {
            const db = getDb();
            await db
                .collection('users')
                .doc(uid)
                .collection('callLogs')
                .doc(callLogId)
                .set({
                    qaInsight: {
                        ...qaInsight,
                        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            return true;
        } catch (err) {
            console.error(`[Firestore] Failed to attach QA insight for ${uid}/${callLogId}:`, err.message);
            return false;
        }
    }
}

module.exports = new CallLogService();
