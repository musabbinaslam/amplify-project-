const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const callLogService = require('./callLogService');
const contestProofStorage = require('./contestProofStorage');
const notificationService = require('./notificationService');
const socketRegistry = require('../sockets/socketRegistry');

const CONTEST_CATEGORIES = new Set(['disconnect', 'server_outage', 'audio_quality', 'other']);
const CONTEST_MAX_AGE_DAYS = 7;
const CONTEST_MAX_AGE_MS = CONTEST_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function getCallOccurredMs(log) {
  const raw = log?.createdAt || log?.timestamp;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function assertContestWithinWindow(log) {
  const occurredMs = getCallOccurredMs(log);
  if (occurredMs == null) return;
  if (Date.now() - occurredMs > CONTEST_MAX_AGE_MS) {
    throw Object.assign(
      new Error(`Contests must be submitted within ${CONTEST_MAX_AGE_DAYS} days of the call`),
      { code: 'CONTEST_EXPIRED' },
    );
  }
}

function attachProofUrls(contestId, proofFiles) {
  return contestProofStorage.refreshProofUrls(contestId, proofFiles);
}

function serializeContest(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    submittedAt: data.submittedAt?.toDate?.()
      ? data.submittedAt.toDate().toISOString()
      : data.submittedAt,
    reviewedAt: data.reviewedAt?.toDate?.()
      ? data.reviewedAt.toDate().toISOString()
      : data.reviewedAt,
  };
}

async function submitContest(agentId, callLogId, { reason, category, files = [] }) {
  if (!admin) throw Object.assign(new Error('Database unavailable'), { code: 'UNAVAILABLE' });

  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 10) {
    throw Object.assign(new Error('Explanation must be at least 10 characters'), { code: 'REASON_TOO_SHORT' });
  }
  if (!CONTEST_CATEGORIES.has(category)) {
    throw Object.assign(new Error('Invalid contest category'), { code: 'INVALID_CATEGORY' });
  }
  const proofUploads = Array.isArray(files) ? files : [];
  const db = getDb();

  const [log, existingPending] = await Promise.all([
    callLogService.getCallLog(agentId, callLogId),
    db
      .collection('callContests')
      .where('agentId', '==', agentId)
      .where('callLogId', '==', callLogId)
      .where('status', '==', 'pending')
      .limit(1)
      .get(),
  ]);

  if (!log) throw Object.assign(new Error('Call log not found'), { code: 'NOT_FOUND' });
  if (log.refunded) throw Object.assign(new Error('This call has already been credited'), { code: 'ALREADY_REFUNDED' });
  if (!log.isBillable || Number(log.cost || 0) <= 0) {
    throw Object.assign(new Error('Only charged calls can be contested'), { code: 'NOT_BILLABLE' });
  }
  if (log.contestStatus === 'pending' || !existingPending.empty) {
    throw Object.assign(new Error('A contest is already under review for this call'), { code: 'CONTEST_PENDING' });
  }
  assertContestWithinWindow(log);

  const { FieldValue } = admin.firestore;

  const contestPayload = {
    agentId,
    callLogId,
    callSid: log.callSid || null,
    campaign: log.campaign || 'unknown',
    campaignLabel: log.campaignLabel || log.campaign || 'unknown',
    duration: Number(log.duration || 0),
    cost: Number(log.cost || 0),
    isBillable: Boolean(log.isBillable),
    recordingUrl: log.recordingUrl || null,
    status: 'pending',
    agentReason: trimmedReason,
    category,
    proofFiles: [],
    submittedAt: FieldValue.serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
    adminNote: null,
    refundAmountCents: null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const contestRef = await db.collection('callContests').add(contestPayload);
  const proofFiles = proofUploads.length
    ? await contestProofStorage.saveProofsToContest(contestRef.id, proofUploads)
    : [];

  const callLogRef = db.collection('users').doc(agentId).collection('callLogs').doc(callLogId);
  const writes = [
    callLogRef.set({
      contestId: contestRef.id,
      contestStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ];
  if (proofFiles.length) {
    writes.push(
      contestRef.set({ proofFiles, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    );
  }
  await Promise.all(writes);

  const campaignLabel = log.campaignLabel || log.campaign || 'Unknown campaign';
  const costLabel = `$${Number(log.cost || 0).toFixed(2)}`;
  notificationService.notifyAdminsInBackground(
    {
      title: 'New call charge contest',
      body: `${campaignLabel} · ${costLabel} — review in Admin dashboard.`,
      priority: 'high',
      linkPath: '/app/admin',
      contestId: contestRef.id,
    },
    'contest',
  );

  console.log(`[Contest] Submitted ${contestRef.id} for ${agentId}/${callLogId}`);
  return { contestId: contestRef.id, status: 'pending' };
}

async function getContestForAgent(agentId, callLogId) {
  if (!admin) return null;
  const log = await callLogService.getCallLog(agentId, callLogId);
  if (!log?.contestId) return null;
  const row = await getContest(log.contestId);
  if (!row || row.agentId !== agentId) return null;
  return row;
}

async function listContests({ status = 'pending', limit = 50 } = {}) {
  if (!admin) return [];
  const db = getDb();
  const lim = Math.min(Number(limit) || 50, 100);
  let snap;
  if (status && status !== 'all') {
    snap = await db.collection('callContests').where('status', '==', status).limit(200).get();
  } else {
    snap = await db.collection('callContests').orderBy('submittedAt', 'desc').limit(lim).get();
  }
  let rows = [];
  for (const doc of snap.docs) {
    const row = serializeContest(doc);
    if (row.proofFiles?.length) {
      row.proofFiles = attachProofUrls(row.id, row.proofFiles);
    }
    rows.push(row);
  }
  if (status && status !== 'all') {
    rows.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    rows = rows.slice(0, lim);
  }
  return rows;
}

async function getContest(contestId) {
  if (!admin || !contestId) return null;
  const db = getDb();
  const doc = await db.collection('callContests').doc(contestId).get();
  if (!doc.exists) return null;
  const row = serializeContest(doc);
  if (row.proofFiles?.length) {
    row.proofFiles = attachProofUrls(contestId, row.proofFiles);
  }
  return row;
}

async function denyContest(contestId, adminUid, adminNote) {
  const note = String(adminNote || '').trim();
  if (note.length < 10) {
    throw Object.assign(new Error('Denial note must be at least 10 characters'), { code: 'REASON_TOO_SHORT' });
  }

  const contest = await getContest(contestId);
  if (!contest) throw Object.assign(new Error('Contest not found'), { code: 'NOT_FOUND' });
  if (contest.status !== 'pending') {
    throw Object.assign(new Error('Contest is not pending review'), { code: 'INVALID_STATE' });
  }

  const db = getDb();
  const { FieldValue } = admin.firestore;

  await Promise.all([
    db.collection('callContests').doc(contestId).set({
      status: 'denied',
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: adminUid,
      adminNote: note,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    db.collection('users').doc(contest.agentId).collection('callLogs').doc(contest.callLogId).set({
      contestStatus: 'denied',
      contestDenyNote: note,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ]);

  return { success: true, contestId, status: 'denied' };
}

async function approveContest(contestId, adminUid, adminReason) {
  const contest = await getContest(contestId);
  if (!contest) throw Object.assign(new Error('Contest not found'), { code: 'NOT_FOUND' });
  if (contest.status !== 'pending') {
    throw Object.assign(new Error('Contest is not pending review'), { code: 'INVALID_STATE' });
  }

  const result = await callLogService.refundCall(contest.agentId, contest.callLogId, {
    reason: adminReason,
    adminUid,
    contestId,
  });

  const campaignLabel = contest.campaignLabel || contest.campaign || 'your call';
  const amountLabel = `$${(Number(result.refundAmountCents || 0) / 100).toFixed(2)}`;
  const agentId = contest.agentId;
  const walletBalanceCents = result.newBalance;

  setImmediate(() => {
    notificationService
      .notifyAgent(agentId, {
        type: 'contest_credited',
        title: 'Call charge credited',
        body: `Your contest for ${campaignLabel} was approved. ${amountLabel} was added to your wallet.`,
        priority: 'high',
        linkPath: '/app/call-logs',
        contestId,
        walletBalanceCents,
      }, 'contest')
      .then((realtime) => {
        if (realtime) socketRegistry.emitToAgent(agentId, 'notification:new', realtime);
      })
      .catch((notifyErr) => {
        console.warn('[Contest] Agent credit notification failed:', notifyErr.message);
      });
  });

  return { ...result, contestId, status: 'approved' };
}

module.exports = {
  CONTEST_CATEGORIES,
  submitContest,
  getContestForAgent,
  listContests,
  getContest,
  denyContest,
  approveContest,
};
