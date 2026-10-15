const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { cached } = require('../utils/readCache');
const callTrace = require('../services/callTraceService');
const agentManager = require('../services/agentManager');
const walletService = require('../services/walletService');
const { parseRecordingSid } = require('../utils/recordingSid');

const CACHE_TTL_SEC = 8;
const LOG_LIMIT = 50;
const FORCE_CHARGE_TX_LIMIT = 80;
const FORCE_CHARGE_REASON = 'force_charge_suspicious_drop';
/** Max age of a call relative to a wallet force-charge debit when callSid is missing. */
const FORCE_CHARGE_MATCH_WINDOW_MS = 48 * 60 * 60 * 1000;
const LOG_FIELDS = [
  'from', 'to', 'callSid', 'campaign', 'campaignLabel', 'agentId', 'status',
  'duration', 'isBillable', 'cost', 'createdAt', 'timestamp', 'disposition',
  'recordingSid', 'recordingUrl', 'forceCharged', 'forceChargedAt', 'forceChargeCents',
];

function toIso(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value || null;
}

function mapLogDoc(doc) {
  const data = doc.data() || {};
  const recordingUrl = data.recordingUrl || null;
  const recordingSid = parseRecordingSid(data.recordingSid || recordingUrl);
  return {
    id: doc.id,
    agentId: data.agentId || doc.ref.parent.parent?.id || null,
    from: data.from || null,
    to: data.to || null,
    callSid: data.callSid || null,
    campaign: data.campaign || null,
    campaignLabel: data.campaignLabel || data.campaign || null,
    status: data.status || null,
    duration: Number(data.duration) || 0,
    isBillable: Boolean(data.isBillable),
    cost: Number(data.cost) || 0,
    disposition: data.disposition || null,
    recordingSid: recordingSid || null,
    recordingUrl,
    forceCharged: data.forceCharged === true,
    forceChargedAt: toIso(data.forceChargedAt) || null,
    forceChargeCents: Number.isFinite(Number(data.forceChargeCents))
      ? Number(data.forceChargeCents)
      : null,
    createdAt: toIso(data.createdAt) || data.timestamp || null,
  };
}

async function queryLogs(field, value) {
  const db = getDb();
  if (!db || !value) return [];
  const run = async (order) => {
    let q = db.collectionGroup('callLogs').where(field, '==', value);
    if (order) q = q.orderBy('createdAt', 'desc');
    return q.select(...LOG_FIELDS).limit(LOG_LIMIT).get();
  };
  try {
    const snap = await run(true);
    return snap.docs.map(mapLogDoc);
  } catch (err) {
    if (err?.code !== 9 && !/index/i.test(err?.message || '')) {
      console.warn('[callTrace] logs query failed:', err.message);
      return [];
    }
    try {
      const snap = await run(false);
      const rows = snap.docs.map(mapLogDoc);
      rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return rows;
    } catch (err2) {
      console.warn('[callTrace] logs fallback failed:', err2.message);
      return [];
    }
  }
}

function formatAgentStatus(state) {
  if (!state || !state.status) {
    return { online: false, status: 'OFFLINE', label: 'Offline', campaignId: null };
  }
  const status = String(state.status).toUpperCase();
  const labels = {
    AVAILABLE: 'Live',
    IN_CALL: 'On call',
    RINGING: 'Ringing',
    WRAP_UP: 'Wrap-up',
  };
  return {
    online: true,
    status,
    label: labels[status] || status.replace(/_/g, ' '),
    campaignId: state.campaignId || null,
  };
}

async function loadAgentMeta(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return {};
  const db = getDb();
  if (!db) return {};

  const [snaps, states, balances] = await Promise.all([
    db.getAll(
      ...unique.map((id) => db.collection('users').doc(id)),
      { fieldMask: ['fullName', 'displayName', 'name', 'email', 'agentName'] },
    ),
    Promise.all(unique.map(async (id) => {
      try {
        return [id, await agentManager.getAgentState(id)];
      } catch {
        return [id, null];
      }
    })),
    Promise.all(unique.map(async (id) => {
      try {
        const cents = await walletService.getBalance(id);
        return [id, Number.isFinite(cents) ? cents : null];
      } catch {
        return [id, null];
      }
    })),
  ]);

  const stateById = Object.fromEntries(states);
  const balanceById = Object.fromEntries(balances);
  const out = {};
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    const d = snap.data() || {};
    const name = d.fullName || d.displayName || d.name || d.agentName || d.email || snap.id;
    const live = formatAgentStatus(stateById[snap.id]);
    out[snap.id] = {
      name,
      online: live.online,
      status: live.status,
      statusLabel: live.label,
      campaignId: live.campaignId,
      balanceCents: balanceById[snap.id],
    };
  });

  // Include redis-only agents (present in timeline/live but missing Firestore user doc)
  unique.forEach((id) => {
    if (out[id]) return;
    const live = formatAgentStatus(stateById[id]);
    out[id] = {
      name: id,
      online: live.online,
      status: live.status,
      statusLabel: live.label,
      campaignId: live.campaignId,
      balanceCents: balanceById[id],
    };
  });

  return out;
}

function txCreatedMs(tx) {
  if (!tx?.createdAt) return 0;
  const t = new Date(tx.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function logCreatedMs(log) {
  if (!log?.createdAt) return 0;
  const t = new Date(log.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isForceChargeTx(tx) {
  return tx?.metadata?.reason === FORCE_CHARGE_REASON;
}

/**
 * Reconcile wallet force-charge debits onto call logs that were never stamped
 * (charges before Call Trace started writing forceCharged on the log).
 * Best-effort heals Firestore so the next lookup is permanent.
 */
async function enrichLogsFromForceChargeHistory(callLogs) {
  const pending = (callLogs || []).filter((l) => l?.agentId && !l.forceCharged);
  if (!pending.length) return callLogs || [];

  const db = getDb();
  if (!db) return callLogs || [];

  const agentIds = [...new Set(pending.map((l) => l.agentId))];
  const txsByAgent = {};
  await Promise.all(agentIds.map(async (agentId) => {
    try {
      const txs = await walletService.getTransactions(agentId, FORCE_CHARGE_TX_LIMIT);
      txsByAgent[agentId] = (txs || []).filter(isForceChargeTx);
    } catch (err) {
      console.warn('[callTrace] force-charge tx lookup failed:', agentId, err.message);
      txsByAgent[agentId] = [];
    }
  }));

  const claimedLogIds = new Set();
  const heals = [];
  const enriched = (callLogs || []).map((log) => ({ ...log }));

  // Pass 1: exact callSid match from newer charges
  for (const log of enriched) {
    if (!log.agentId || log.forceCharged || claimedLogIds.has(log.id)) continue;
    if (!log.callSid) continue;
    const match = (txsByAgent[log.agentId] || []).find(
      (tx) => tx.metadata?.callSid && tx.metadata.callSid === log.callSid,
    );
    if (!match) continue;
    claimedLogIds.add(log.id);
    applyForceChargeOverlay(log, match);
    heals.push(healForceChargedLog(db, log, match));
  }

  // Pass 2: older charges without callSid — match agent + campaign, call before debit
  for (const agentId of agentIds) {
    const leftoverTxs = (txsByAgent[agentId] || [])
      .filter((tx) => !tx.metadata?.callSid)
      .sort((a, b) => txCreatedMs(a) - txCreatedMs(b));

    for (const tx of leftoverTxs) {
      const campaignId = tx.metadata?.campaignId || null;
      const txMs = txCreatedMs(tx);
      const candidates = enriched
        .filter((log) => {
          if (log.agentId !== agentId || log.forceCharged || claimedLogIds.has(log.id)) return false;
          if (campaignId && log.campaign && log.campaign !== campaignId) return false;
          // Prefer never-billed / zero-cost calls (typical force-charge targets)
          if (log.isBillable && Number(log.cost || 0) > 0) return false;
          const callMs = logCreatedMs(log);
          if (!callMs || !txMs) return false;
          // Charge at/after the call (small skew), and within a tight window
          if (callMs > txMs + 60_000) return false;
          if (txMs - callMs > FORCE_CHARGE_MATCH_WINDOW_MS) return false;
          return true;
        })
        .sort((a, b) => {
          // Closest call before the debit wins
          const da = Math.abs(txMs - logCreatedMs(a));
          const dbGap = Math.abs(txMs - logCreatedMs(b));
          return da - dbGap;
        });

      const pick = candidates[0];
      if (!pick) continue;
      claimedLogIds.add(pick.id);
      applyForceChargeOverlay(pick, tx);
      heals.push(healForceChargedLog(db, pick, tx));
    }
  }

  if (heals.length) {
    Promise.allSettled(heals).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) console.warn(`[callTrace] force-charge heal failed for ${failed} log(s)`);
    });
  }

  return enriched;
}

function applyForceChargeOverlay(log, tx) {
  const cents = Number.isFinite(Number(tx.amountCents))
    ? Number(tx.amountCents)
    : Number(tx.metadata?.amountCents) || null;
  log.forceCharged = true;
  log.forceChargedAt = tx.createdAt || log.forceChargedAt || null;
  log.forceChargeCents = cents;
  if (cents != null && !(Number(log.cost) > 0)) {
    log.cost = cents / 100;
  }
  log.isBillable = true;
}

async function healForceChargedLog(db, log, tx) {
  if (!log?.agentId || !log?.id) return;
  const { FieldValue } = admin.firestore;
  const cents = Number.isFinite(Number(tx.amountCents)) ? Number(tx.amountCents) : null;
  const payload = {
    forceCharged: true,
    forceChargedBy: tx.metadata?.adminId || 'backfill',
    forceChargeCents: cents,
    isBillable: true,
  };
  if (cents != null) payload.cost = cents / 100;
  if (tx.createdAt) {
    const at = new Date(tx.createdAt);
    if (!Number.isNaN(at.getTime())) payload.forceChargedAt = at;
  } else {
    payload.forceChargedAt = FieldValue.serverTimestamp();
  }
  await db.collection('users').doc(log.agentId).collection('callLogs').doc(log.id).set(payload, { merge: true });
}

async function assembleTrace(parsed) {
  let last10 = parsed.last10 || null;
  let e164 = parsed.e164 || null;
  let callSid = parsed.callSid || null;

  if (parsed.kind === 'sid') {
    last10 = await callTrace.resolveSid(callSid);
    if (last10) e164 = `+1${last10}`;
  }

  const [timeline, live, rawLogs] = await Promise.all([
    last10 ? callTrace.getTimelineByLast10(last10) : Promise.resolve([]),
    last10 ? callTrace.getLive(last10) : Promise.resolve(null),
    parsed.kind === 'sid'
      ? queryLogs('callSid', callSid)
      : queryLogs('from', e164),
  ]);

  const callLogs = await enrichLogsFromForceChargeHistory(rawLogs);

  const agentIds = [
    ...timeline.map((e) => e.agentId),
    ...callLogs.map((l) => l.agentId),
    live?.agentId,
  ];
  const agentMeta = await loadAgentMeta(agentIds);

  return {
    query: {
      kind: parsed.kind,
      last10,
      e164,
      callSid: callSid || null,
    },
    timeline,
    live,
    callLogs,
    agentMeta,
  };
}

async function getCallTrace(req, res) {
  try {
    const parsed = callTrace.parseQuery(req.query.q);
    if (parsed.kind === 'empty' || parsed.kind === 'invalid') {
      return res.status(400).json({ error: 'Provide a phone number or CallSid' });
    }
    const cacheKey = parsed.kind === 'sid' ? `sid:${parsed.callSid}` : `ph:${parsed.last10}`;
    const { value, hit, ageMs } = await cached(
      'callTrace',
      cacheKey,
      CACHE_TTL_SEC,
      () => assembleTrace(parsed),
    );
    res.json({
      ...value,
      cached: hit,
      meta: { generatedAt: new Date().toISOString(), cacheAgeMs: ageMs },
    });
  } catch (err) {
    console.error('[Admin] getCallTrace:', err.message);
    res.status(500).json({ error: 'Failed to load call trace' });
  }
}

module.exports = { getCallTrace };
