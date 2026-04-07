const admin = require('../config/firebaseAdmin');
const { CAMPAIGN_CONFIG } = require('../config/pricing');

class CallLogService {
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
            callSid 
        } = data;

        const config = CAMPAIGN_CONFIG[campaignId] || { buffer: 0, price: 0 };
        const durationSec = parseInt(duration) || 0;
        
        // AUTOMATED BILLING LOGIC
        const isBillable = durationSec >= config.buffer && status === 'completed';
        const cost = isBillable ? config.price : 0;

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
            type: campaignId.includes('transfer') ? 'Transfer' : 'Inbound'
        };

        console.log(`[Billing] 💸 Call ${callSid}: ${durationSec}s. Billable: ${isBillable} ($${cost})`);

        // Save to Firestore under the agent's user document
        if (admin && agentId) {
            try {
                const db = admin.firestore();
                const callLogsRef = db.collection('users').doc(agentId).collection('callLogs');
                const docRef = await callLogsRef.add({
                    ...newLog,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                newLog.id = docRef.id;
                console.log(`[Firestore] ✅ Call log saved for user ${agentId}: ${docRef.id}`);
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
    async getLogsByUser(uid, limit = 100) {
        if (!admin || !uid) return [];
        try {
            const db = admin.firestore();
            const snap = await db
                .collection('users')
                .doc(uid)
                .collection('callLogs')
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

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
            const db = admin.firestore();
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
