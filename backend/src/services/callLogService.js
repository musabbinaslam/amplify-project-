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
            dialCallSid,
            recordingUrl,
            recordingSid,
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
                const newBalance = await walletService.deductCredits(agentId, cost * 100, {
                   callSid, campaignId, campaignLabel: config.label || campaignId
                });

                // If balance is now zero or below, notify the agent via their live socket.
                // The call has already completed — this notification fires AFTER billing,
                // so the agent's experience on the call was never interrupted.
                if (typeof newBalance === 'number' && newBalance <= 0) {
                    const socketRegistry = require('../sockets/socketRegistry');
                    const notified = socketRegistry.emitToAgent(agentId, 'agent:balance_exhausted', {
                        balance: newBalance,
                        callSid,
                        message: 'Your wallet balance has been exhausted. Please top up to continue taking calls.',
                    });
                    console.log(`[Wallet] 📭 Balance exhausted for agent ${agentId} after call ${callSid} — socket ${notified ? 'notified ✅' : 'not connected (agent already offline)'}`);
                }
            } catch (err) {
                console.error("[Billing] Failed to deduct credits:", err.message);
                // Call will still be logged
            }
        }


        const newLog = {
            callSid,
            dialCallSid: dialCallSid || null,
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
            recordingUrl: recordingUrl || null,
            recordingSid: recordingSid || null,
        };

        console.log(`[Billing] 💸 Call ${callSid}: ${durationSec}s. Billable: ${isBillable} ($${cost})`);

        // Save to Firestore under the agent's user document. Upserts by callSid so
        // an early disposition PATCH that created a stub doc merges into the same record.
        if (admin && agentId) {
            try {
                const db = getDb();
                const callLogsRef = db.collection('users').doc(agentId).collection('callLogs');

                let existingDocId = null;
                if (callSid) {
                    const existing = await callLogsRef.where('callSid', '==', callSid).limit(1).get();
                    if (!existing.empty) existingDocId = existing.docs[0].id;
                }

                if (existingDocId) {
                    await callLogsRef.doc(existingDocId).set({
                        ...newLog,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    newLog.id = existingDocId;
                    console.log(`[Firestore] ✅ Call log merged for user ${agentId}: ${existingDocId}`);
                } else {
                    const docRef = await callLogsRef.add({
                        ...newLog,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    newLog.id = docRef.id;
                    console.log(`[Firestore] ✅ Call log saved for user ${agentId}: ${docRef.id}`);
                }
                await this.upsertAdminDailyMetrics(newLog);
            } catch (err) {
                console.error(`[Firestore] ❌ Failed to save call log for user ${agentId}:`, err.message);
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

    async getCallLog(agentId, callLogId) {
        if (!admin || !agentId || !callLogId) return null;
        try {
            const db = getDb();
            const doc = await db.collection('users').doc(agentId).collection('callLogs').doc(callLogId).get();
            if (!doc.exists) return null;
            const data = doc.data() || {};
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.()
                    ? data.createdAt.toDate().toISOString()
                    : data.createdAt,
            };
        } catch (err) {
            console.error(`[Firestore] Failed to load call log ${agentId}/${callLogId}:`, err.message);
            return null;
        }
    }

    /**
     * Credit wallet for a previously billable call (admin or contest approval).
     */
    async refundCall(agentId, callLogId, { reason, adminUid, contestId = null }) {
        if (!admin) throw Object.assign(new Error('Database unavailable'), { code: 'UNAVAILABLE' });

        const trimmedReason = String(reason || '').trim();
        if (trimmedReason.length < 10) {
            throw Object.assign(new Error('Refund reason must be at least 10 characters'), { code: 'REASON_TOO_SHORT' });
        }

        const log = await this.getCallLog(agentId, callLogId);
        if (!log) throw Object.assign(new Error('Call log not found'), { code: 'NOT_FOUND' });
        if (log.refunded) throw Object.assign(new Error('Call already refunded'), { code: 'ALREADY_REFUNDED' });
        if (!log.isBillable || Number(log.cost || 0) <= 0) {
            throw Object.assign(new Error('Call was not charged'), { code: 'NOT_BILLABLE' });
        }

        const walletService = require('./walletService');
        const amountCents = Math.round(Number(log.cost) * 100);
        const idempotencyKey = log.callSid
            ? `refund_${log.callSid}`
            : `refund_${agentId}_${callLogId}`;

        const newBalance = await walletService.addCredits(agentId, amountCents, 'call_refund', {
            idempotencyKey,
            callLogId,
            callSid: log.callSid || null,
            campaignId: log.campaign,
            campaignLabel: log.campaignLabel || log.campaign,
            refundedBy: adminUid,
            reason: trimmedReason,
            contestId: contestId || null,
        });

        const db = getDb();
        const callLogRef = db.collection('users').doc(agentId).collection('callLogs').doc(callLogId);
        const refundWrites = [
            callLogRef.set({
                refunded: true,
                refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                refundedBy: adminUid,
                refundReason: trimmedReason,
                refundAmountCents: amountCents,
                contestStatus: contestId ? 'approved' : log.contestStatus || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true }),
        ];
        if (contestId) {
            refundWrites.push(
                db.collection('callContests').doc(contestId).set({
                    status: 'approved',
                    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
                    reviewedBy: adminUid,
                    adminNote: trimmedReason,
                    refundAmountCents: amountCents,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }),
            );
        }
        await Promise.all(refundWrites);

        console.log(`[Billing] ↩️ Refunded $${(amountCents / 100).toFixed(2)} to ${agentId} for call ${callLogId}`);

        try {
            const socketRegistry = require('../sockets/socketRegistry');
            socketRegistry.emitToAgent(agentId, 'wallet:updated', { balance: newBalance });
        } catch (socketErr) {
            console.warn('[Billing] wallet:updated socket emit failed:', socketErr.message);
        }

        return { success: true, newBalance, refundAmountCents: amountCents, callLogId };
    }

    async updateCallLogBySid(uid, callSids, updates) {
        if (!admin || !uid || !callSids) return false;
        
        const sidsArray = Array.isArray(callSids) ? callSids : [callSids];
        
        try {
            const db = getDb();
            const callLogsRef = db.collection('users').doc(uid).collection('callLogs');
            
            let docId = null;
            for (const sid of sidsArray) {
                if (!sid) continue;
                const existing = await callLogsRef.where('callSid', '==', sid).limit(1).get();
                if (!existing.empty) {
                    docId = existing.docs[0].id;
                    break;
                }
            }

            if (!docId) {
                // If not found by callSid, also try dialCallSid as fallback
                for (const sid of sidsArray) {
                    if (!sid) continue;
                    const existingDial = await callLogsRef.where('dialCallSid', '==', sid).limit(1).get();
                    if (!existingDial.empty) {
                        docId = existingDial.docs[0].id;
                        break;
                    }
                }
            }

            if (docId) {
                await callLogsRef.doc(docId).update({
                    ...updates,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return true;
            }
            console.warn(`[Firestore] ⚠️ Disposition for ${sidsArray.join(',')} received before Twilio callback — agent unblocked, data will persist on next logCall.`);
            return true;
        } catch (err) {
            console.error(`[Firestore] Failed to update call log ${sidsArray.join(',')}:`, err.message);
            return false;
        }
    }
}

module.exports = new CallLogService();
