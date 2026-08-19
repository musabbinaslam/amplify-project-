const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const { parseRecordingSid, isMockCallLog } = require('../utils/recordingSid');

const QA_CLAIMED_STATUSES = ['pending_review', 'confirmed', 'dismissed', 'processing'];
const QA_BACKFILL_SKIP_CALL_STATUSES = new Set([
    'busy',
    'failed',
    'no-answer',
    'no_answer',
    'canceled',
    'cancelled',
    'missed',
]);

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
            agencyId: explicitAgencyId,
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

                // If balance is now too low to take another call, notify the agent via their live socket.
                // The call has already completed — this notification fires AFTER billing,
                // so the agent's experience on the call was never interrupted.
                if (typeof newBalance === 'number' && newBalance < config.price * 100) {
                    const socketRegistry = require('../sockets/socketRegistry');
                    const notified = await socketRegistry.emitToAgent(agentId, 'agent:balance_exhausted', {
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
            agencyId: explicitAgencyId ?? null,
        };

        // Resolve agencyId from agent profile when not passed explicitly
        if (newLog.agencyId == null && agentId && admin) {
            try {
                const userSnap = await getDb().collection('users').doc(agentId).get();
                if (userSnap.exists) {
                    const userAgencyId = userSnap.data()?.agencyId;
                    newLog.agencyId = userAgencyId == null || userAgencyId === '' ? null : String(userAgencyId);
                }
            } catch {
                /* non-fatal */
            }
        }

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

    async claimQaAudioReview(uid, callLogId, { force = false } = {}) {
        if (!admin || !uid || !callLogId) return false;
        const db = getDb();
        const ref = db.collection('users').doc(uid).collection('callLogs').doc(callLogId);
        try {
            return await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) return false;
                const status = snap.data()?.qaAudioReview?.status;
                if (!force && status && QA_CLAIMED_STATUSES.includes(status)) {
                    return false;
                }
                tx.set(ref, {
                    qaAudioReview: {
                        status: 'processing',
                        transcript: '',
                        summary: 'Analyzing recording…',
                        violations: [],
                        source: 'processing',
                        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
                        version: 'qa-audio-v1',
                        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return true;
            });
        } catch (err) {
            console.error(`[Firestore] claimQaAudioReview failed for ${uid}/${callLogId}:`, err.message);
            return false;
        }
    }

    async attachQaAudioReview(uid, callLogId, qaAudioReview) {
        if (!admin || !uid || !callLogId || !qaAudioReview) return false;
        try {
            const db = getDb();
            await db
                .collection('users')
                .doc(uid)
                .collection('callLogs')
                .doc(callLogId)
                .set({
                    qaAudioReview: {
                        ...qaAudioReview,
                        generatedAt: qaAudioReview.generatedAt || admin.firestore.FieldValue.serverTimestamp(),
                    },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            return true;
        } catch (err) {
            console.error(`[Firestore] Failed to attach QA audio review for ${uid}/${callLogId}:`, err.message);
            return false;
        }
    }

    async findCallLogByCallSid(agentId, callSid) {
        if (!admin || !agentId || !callSid) return null;
        try {
            const db = getDb();
            const ref = db.collection('users').doc(agentId).collection('callLogs');
            let snap = await ref.where('callSid', '==', callSid).limit(1).get();
            if (snap.empty) {
                snap = await ref.where('dialCallSid', '==', callSid).limit(1).get();
            }
            if (snap.empty) return null;
            const doc = snap.docs[0];
            const data = doc.data() || {};
            return { id: doc.id, agentId, ...data };
        } catch (err) {
            console.error(`[Firestore] findCallLogByCallSid failed for ${agentId}/${callSid}:`, err.message);
            return null;
        }
    }

    async listQaAudioReviews({ status = 'pending_review', limit = 20, offset = 0 } = {}) {
        if (!admin) {
            return { reviews: [], total: 0, hasMore: false, pageSize: 20, offset: 0 };
        }
        const allowed = new Set(['pending_review', 'clear', 'confirmed', 'dismissed', 'processing']);
        const statuses = status === 'all'
            ? ['pending_review', 'clear', 'confirmed', 'dismissed', 'processing']
            : allowed.has(status) ? [status] : ['pending_review'];
        // Fixed scan window so page 2+ sees the same sorted set as page 1.
        const scanCap = 300;
        const pageSize = Math.min(Math.max(Number(limit) || 20, 1), scanCap);
        const skip = Math.max(0, Number(offset) || 0);

        try {
            const db = getDb();
            const snaps = await Promise.all(statuses.map((s) => (
                db.collectionGroup('callLogs')
                    .where('qaAudioReview.status', '==', s)
                    .limit(scanCap)
                    .get()
            )));

            const rows = [];
            snaps.forEach((snap) => {
                snap.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    const agentId = data.agentId || doc.ref.parent.parent.id;
                    const review = data.qaAudioReview || {};
                    rows.push({
                        id: doc.id,
                        callLogId: doc.id,
                        agentId,
                        agencyId: data.agencyId ?? null,
                        callSid: data.callSid || null,
                        campaign: data.campaign || 'unknown',
                        campaignLabel: data.campaignLabel || data.campaign || 'unknown',
                        duration: Number(data.duration || 0),
                        cost: Number(data.cost || 0),
                        isBillable: Boolean(data.isBillable),
                        recordingUrl: data.recordingUrl || null,
                        recordingSid: data.recordingSid || null,
                        createdAt: data.createdAt?.toDate?.()
                            ? data.createdAt.toDate().toISOString()
                            : data.createdAt || data.timestamp || null,
                        qaAudioReview: {
                            ...review,
                            generatedAt: review.generatedAt?.toDate?.()
                                ? review.generatedAt.toDate().toISOString()
                                : review.generatedAt || null,
                            review: review.review ? {
                                ...review.review,
                                at: review.review.at?.toDate?.()
                                    ? review.review.at.toDate().toISOString()
                                    : review.review.at || null,
                            } : null,
                        },
                    });
                });
            });

            rows.sort((a, b) => {
                const aTs = new Date(a.qaAudioReview?.generatedAt || a.createdAt || 0).getTime();
                const bTs = new Date(b.qaAudioReview?.generatedAt || b.createdAt || 0).getTime();
                return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
            });

            // Dedupe if "all" pulled the same doc across status queries (shouldn't, but safe).
            const seen = new Set();
            const unique = [];
            for (const row of rows) {
                const key = `${row.agentId}/${row.callLogId || row.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                unique.push(row);
            }

            const windowed = unique.slice(0, scanCap);
            const reviews = windowed.slice(skip, skip + pageSize);
            const total = windowed.length;
            const hasMore = skip + pageSize < total;
            return {
                reviews,
                total,
                hasMore,
                pageSize,
                offset: skip,
                capped: unique.length >= scanCap,
            };
        } catch (err) {
            console.error('[Firestore] listQaAudioReviews failed:', err.message);
            return { reviews: [], total: 0, hasMore: false, pageSize, offset: skip };
        }
    }

    async countQaAudioReviews(status = 'pending_review') {
        const out = await this.listQaAudioReviews({ status, limit: 100, offset: 0 });
        return Array.isArray(out) ? out.length : (out.total || out.reviews?.length || 0);
    }

    async getQaAudioPipelineStatus() {
        const [processingOut, pendingOut, clearOut, confirmedOut, dismissedOut] = await Promise.all([
            this.listQaAudioReviews({ status: 'processing', limit: 50, offset: 0 }),
            this.listQaAudioReviews({ status: 'pending_review', limit: 50, offset: 0 }),
            this.listQaAudioReviews({ status: 'clear', limit: 50, offset: 0 }),
            this.listQaAudioReviews({ status: 'confirmed', limit: 50, offset: 0 }),
            this.listQaAudioReviews({ status: 'dismissed', limit: 50, offset: 0 }),
        ]);
        const processing = processingOut.reviews || [];
        const pending = pendingOut.reviews || [];
        const clear = clearOut.reviews || [];
        const confirmed = confirmedOut.reviews || [];
        const dismissed = dismissedOut.reviews || [];
        const all = [...processing, ...pending, ...clear, ...confirmed, ...dismissed].sort((a, b) => {
            const aTs = new Date(a.qaAudioReview?.generatedAt || a.createdAt || 0).getTime();
            const bTs = new Date(b.qaAudioReview?.generatedAt || b.createdAt || 0).getTime();
            return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
        });
        const last = all[0] || null;
        const lastGemini = all.find((row) => row.qaAudioReview?.source === 'gemini_audio') || null;
        const qa = last?.qaAudioReview || {};
        return {
            counts: {
                processing: processingOut.total ?? processing.length,
                pending: pendingOut.total ?? pending.length,
                clear: clearOut.total ?? clear.length,
                confirmed: confirmedOut.total ?? confirmed.length,
                dismissed: dismissedOut.total ?? dismissed.length,
            },
            lastReview: last ? {
                callLogId: last.callLogId || last.id,
                agentId: last.agentId,
                campaign: last.campaignLabel || last.campaign,
                status: qa.status || null,
                source: qa.source || null,
                summary: qa.summary || '',
                generatedAt: qa.generatedAt || last.createdAt || null,
                violationCount: Array.isArray(qa.violations) ? qa.violations.length : 0,
            } : null,
            lastGeminiAt: lastGemini?.qaAudioReview?.generatedAt || null,
        };
    }

    async findCallLogByRecordingSid(recordingSid) {
        if (!admin || !recordingSid) return null;
        try {
            const db = getDb();
            const snap = await db.collectionGroup('callLogs')
                .where('recordingSid', '==', recordingSid)
                .limit(1)
                .get();
            if (snap.empty) return null;
            const doc = snap.docs[0];
            const data = doc.data() || {};
            const agentId = doc.ref.parent.parent.id;
            return {
                id: doc.id,
                agentId,
                agencyId: data.agencyId ?? null,
                ...data,
            };
        } catch (err) {
            console.error(`[Firestore] findCallLogByRecordingSid failed for ${recordingSid}:`, err.message);
            return null;
        }
    }

    qaAudioBackfillSkipReason(data, { force = false, maxDurationSec = 0, minDurationSec = 0 } = {}) {
        if (isMockCallLog(data)) return 'mock_call';
        const callStatus = String(data?.status || '').toLowerCase();
        if (QA_BACKFILL_SKIP_CALL_STATUSES.has(callStatus)) return 'skipped_status';
        const recordingSid = parseRecordingSid(data?.recordingSid || data?.recordingUrl);
        if (!recordingSid) return 'no_recording';
        const duration = Number(data?.duration || 0);
        const maxDur = Number(maxDurationSec) || 0;
        const minDur = Number(minDurationSec) || 0;
        if (minDur > 0 && !(duration >= minDur)) return 'too_short';
        if (maxDur > 0 && !(duration > 0 && duration <= maxDur)) return 'too_long';
        // Don't keep retrying recordings Twilio already said are gone.
        if (!force && data?.qaAudioReview?.source === 'recording_fetch_failed') return 'recording_gone';
        if (force) return null;
        const qa = data?.qaAudioReview || {};
        if (QA_CLAIMED_STATUSES.includes(qa.status)) return 'in_flight_or_reviewed';
        if (qa.source === 'gemini_audio') return 'already_analyzed';
        return null;
    }

    async fetchRecentCallLogDocs(userRef, perUserLimit) {
        const col = userRef.collection('callLogs');
        const limit = Math.min(Math.max(Number(perUserLimit) || 80, 1), 200);
        try {
            const snap = await col.orderBy('createdAt', 'desc').limit(limit).get();
            if (!snap.empty) return snap.docs;
        } catch (_) { /* some older logs only have timestamp */ }
        try {
            const snap = await col.orderBy('timestamp', 'desc').limit(limit).get();
            if (!snap.empty) return snap.docs;
        } catch (_) { /* fall through */ }
        const snap = await col.limit(limit).get();
        return snap.docs;
    }

    async collectClearQaAudioReanalyzeCandidates({ limit = 1 } = {}) {
        const cap = Math.min(Math.max(Number(limit) || 1, 1), 25);
        const stats = {
            scannedUsers: 0,
            scannedLogs: 0,
            skippedNoRecording: 0,
            skippedAlreadyAnalyzed: 0,
            skippedInFlight: 0,
            skippedStatus: 0,
            skippedTooLong: 0,
            skippedTooShort: 0,
            skippedMock: 0,
            skippedRecordingGone: 0,
            maxDurationSec: null,
            minDurationSec: null,
            preferShort: false,
            fromClear: true,
            candidates: [],
        };
        if (!admin) return stats;

        const clearOut = await this.listQaAudioReviews({ status: 'clear', limit: Math.max(cap * 4, 40), offset: 0 });
        const clearRows = clearOut.reviews || [];
        stats.scannedLogs = clearRows.length;

        for (const row of clearRows) {
            if (stats.candidates.length >= cap) break;
            if (isMockCallLog(row)) {
                stats.skippedMock += 1;
                continue;
            }
            const recordingSid = parseRecordingSid(row.recordingSid || row.recordingUrl);
            if (!recordingSid) {
                stats.skippedNoRecording += 1;
                continue;
            }
            if (row.qaAudioReview?.source === 'recording_fetch_failed') {
                stats.skippedRecordingGone += 1;
                continue;
            }

            stats.candidates.push({
                ...row,
                id: row.callLogId || row.id,
                agentId: row.agentId,
                recordingSid,
            });
        }

        return stats;
    }

    async collectQaAudioBackfillCandidates({
        limit = 25,
        force = false,
        uid = '',
        maxDurationSec = 0,
        minDurationSec = 0,
        preferShort = false,
        sinceMs = 0,
    } = {}) {
        const cap = Math.min(Math.max(Number(limit) || 25, 1), 100);
        const gatherCap = Math.min(Math.max(cap * 8, cap), 400);
        const maxDur = Math.max(0, Number(maxDurationSec) || 0);
        const minDur = Math.max(0, Number(minDurationSec) || 0);
        const since = Math.max(0, Number(sinceMs) || 0);
        const stats = {
            scannedUsers: 0,
            scannedLogs: 0,
            skippedNoRecording: 0,
            skippedAlreadyAnalyzed: 0,
            skippedInFlight: 0,
            skippedStatus: 0,
            skippedTooLong: 0,
            skippedTooShort: 0,
            skippedMock: 0,
            skippedRecordingGone: 0,
            skippedTooOld: 0,
            maxDurationSec: maxDur || null,
            minDurationSec: minDur || null,
            preferShort: Boolean(preferShort),
            sinceMs: since || null,
            candidates: [],
        };
        if (!admin) return stats;

        const db = getDb();
        const targetUid = String(uid || '').trim();
        const userDocs = targetUid
            ? [{ id: targetUid, ref: db.collection('users').doc(targetUid) }]
            : (await db.collection('users').select().get()).docs;

        const toMillis = (value) => {
            if (!value) return 0;
            if (typeof value.toDate === 'function') {
                try { return value.toDate().getTime(); } catch (_) { return 0; }
            }
            const ms = new Date(value).getTime();
            return Number.isFinite(ms) ? ms : 0;
        };

        for (const userDoc of userDocs) {
            if (!targetUid && stats.scannedUsers >= 250) break;
            if (stats.candidates.length >= gatherCap) break;
            stats.scannedUsers += 1;
            let docs = [];
            try {
                docs = await this.fetchRecentCallLogDocs(userDoc.ref, targetUid ? 200 : 80);
            } catch (err) {
                console.warn(`[Firestore] backfill scan failed for ${userDoc.id}: ${err.message}`);
                continue;
            }

            for (const doc of docs) {
                if (stats.candidates.length >= gatherCap) break;
                stats.scannedLogs += 1;
                const data = doc.data() || {};
                if (since > 0) {
                    const createdMs = toMillis(data.createdAt || data.timestamp);
                    if (!createdMs || createdMs < since) {
                        stats.skippedTooOld += 1;
                        continue;
                    }
                }
                const reason = this.qaAudioBackfillSkipReason(data, {
                    force,
                    maxDurationSec: maxDur,
                    minDurationSec: minDur,
                });
                if (reason === 'no_recording') {
                    stats.skippedNoRecording += 1;
                    continue;
                }
                if (reason === 'already_analyzed') {
                    stats.skippedAlreadyAnalyzed += 1;
                    continue;
                }
                if (reason === 'in_flight_or_reviewed') {
                    stats.skippedInFlight += 1;
                    continue;
                }
                if (reason === 'skipped_status') {
                    stats.skippedStatus += 1;
                    continue;
                }
                if (reason === 'too_long') {
                    stats.skippedTooLong += 1;
                    continue;
                }
                if (reason === 'too_short') {
                    stats.skippedTooShort += 1;
                    continue;
                }
                if (reason === 'mock_call') {
                    stats.skippedMock += 1;
                    continue;
                }
                if (reason === 'recording_gone') {
                    stats.skippedRecordingGone += 1;
                    continue;
                }

                const recordingSid = parseRecordingSid(data.recordingSid || data.recordingUrl);
                if (!data.recordingSid && recordingSid) {
                    try {
                        await doc.ref.set({ recordingSid }, { merge: true });
                    } catch (_) { /* proxy still works from URL parse */ }
                }

                stats.candidates.push({
                    ...data,
                    id: doc.id,
                    agentId: data.agentId || userDoc.id,
                    recordingSid,
                });
            }
        }

        stats.candidates.sort((a, b) => {
            const durDiff = Number(a.duration || 0) - Number(b.duration || 0);
            if (preferShort) {
                if (durDiff !== 0) return durDiff;
            } else if (minDur > 0 || maxDur === 0) {
                // Longer-test modes: pick the longest eligible clip first.
                if (durDiff !== 0) return -durDiff;
            }
            return toMillis(b.createdAt || b.timestamp) - toMillis(a.createdAt || a.timestamp);
        });
        stats.candidates = stats.candidates.slice(0, cap);
        return stats;
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
            await socketRegistry.emitToAgent(agentId, 'wallet:updated', { balance: newBalance });
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

            // ULTIMATE FALLBACK: If we still didn't find the call log (due to lost SIDs or race conditions),
            // just grab the agent's most recent call log from the last 15 minutes and update it.
            if (!docId && updates && updates.disposition) {
                const fiveMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
                const recentLogs = await callLogsRef
                    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(fiveMinsAgo))
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get();
                
                if (!recentLogs.empty) {
                    docId = recentLogs.docs[0].id;
                    console.log(`[Firestore] 🛡️ Fallback: Applied disposition to latest call log ${docId} for agent ${uid}`);
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

    async updateCallLogById(uid, callLogId, updates) {
        if (!admin || !uid || !callLogId || !updates) return false;
        try {
            const db = getDb();
            const docRef = db.collection('users').doc(uid).collection('callLogs').doc(callLogId);
            const docSnap = await docRef.get();
            if (!docSnap.exists) {
                return false;
            }
            await docRef.update({
                ...updates,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return true;
        } catch (err) {
            console.error(`[Firestore] Failed to update call log ${callLogId} for user ${uid}:`, err.message);
            return false;
        }
    }
}

module.exports = new CallLogService();
