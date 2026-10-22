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

function txId(tx) {
  return tx?.id || `${txCreatedMs(tx)}:${tx?.amountCents || 0}:${tx?.metadata?.campaignId || ''}`;
}

async function loadAgentForceChargedLogs(db, agentId) {
  try {
    const snap = await db.collection('users').doc(agentId).collection('callLogs')
      .where('forceCharged', '==', true)
      .limit(80)
      .get();
    return snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        agentId,
        callSid: data.callSid || null,
        campaign: data.campaign || null,
        forceChargedAt: toIso(data.forceChargedAt) || null,
        forceChargeCents: Number.isFinite(Number(data.forceChargeCents))
          ? Number(data.forceChargeCents)
          : null,
        createdAt: toIso(data.createdAt) || data.timestamp || null,
      };
    });
  } catch (err) {
    console.warn('[callTrace] forceCharged log lookup failed:', agentId, err.message);
    return [];
  }
}

/**
 * Each wallet force-charge may map to at most one call log.
 * Claim txs already represented on the agent's forceCharged logs first,
 * then only apply leftovers to the current trace (callSid preferred).
 */
function claimTxsAlreadyStamped(txs, existingForcedLogs) {
  const claimed = new Set();
  const logs = [...(existingForcedLogs || [])];

  // Exact callSid wins
  for (const log of logs) {
    if (!log.callSid) continue;
    const tx = txs.find(
      (t) => !claimed.has(txId(t)) && t.metadata?.callSid && t.metadata.callSid === log.callSid,
    );
    if (tx) claimed.add(txId(tx));
  }

  // Older charges: one stamp timestamp → one tx (closest amount/campaign)
  for (const log of logs) {
    const stampMs = log.forceChargedAt ? new Date(log.forceChargedAt).getTime() : 0;
    if (!stampMs) continue;
    const already = txs.find(
      (t) => claimed.has(txId(t)) && t.metadata?.callSid && t.metadata.callSid === log.callSid,
    );
    if (already) continue;

    let best = null;
    let bestGap = Infinity;
    for (const t of txs) {
      if (claimed.has(txId(t))) continue;
      if (t.metadata?.callSid) continue; // those only bind via callSid
      const gap = Math.abs(txCreatedMs(t) - stampMs);
      if (gap > 5_000) continue;
      if (log.forceChargeCents != null && Number(t.amountCents) !== Number(log.forceChargeCents)) continue;
      if (log.campaign && t.metadata?.campaignId && log.campaign !== t.metadata.campaignId) continue;
      if (gap < bestGap) {
        bestGap = gap;
        best = t;
      }
    }
    if (best) claimed.add(txId(best));
  }

  return claimed;
}

function clearForceChargeFields(log) {
  log.forceCharged = false;
  log.forceChargedAt = null;
  log.forceChargeCents = null;
  log.isBillable = false;
  log.cost = 0;
}

async function unstampForceChargedLog(db, agentId, logId) {
  if (!db || !agentId || !logId) return;
  const { FieldValue } = admin.firestore;
  await db.collection('users').doc(agentId).collection('callLogs').doc(logId).set(
    {
      forceCharged: false,
      forceChargedAt: FieldValue.delete(),
      forceChargedBy: FieldValue.delete(),
      forceChargeCents: FieldValue.delete(),
      isBillable: false,
      cost: 0,
    },
    { merge: true },
  );
}

/**
 * One wallet debit timestamp must only stamp one call. When older backfill
 * wrote the same forceChargedAt onto multiple logs, keep the closest call
 * and clear the rest (response + Firestore).
 */
function reconcileDuplicateForceChargeStamps(db, enriched, forcedByAgent) {
  const clearIds = new Set();
  const repairs = [];

  for (const [agentId, forced] of Object.entries(forcedByAgent || {})) {
    const groups = new Map();
    for (const log of forced || []) {
      const key = log.forceChargedAt || log.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(log);
    }

    for (const [, list] of groups) {
      if (list.length < 2) continue;
      const stampMs = list[0].forceChargedAt
        ? new Date(list[0].forceChargedAt).getTime()
        : 0;
      const sorted = [...list].sort((a, b) => {
        const aMs = logCreatedMs(a);
        const bMs = logCreatedMs(b);
        const aOk = !stampMs || aMs <= stampMs + 60_000;
        const bOk = !stampMs || bMs <= stampMs + 60_000;
        if (aOk !== bOk) return aOk ? -1 : 1;
        return Math.abs(stampMs - aMs) - Math.abs(stampMs - bMs);
      });
      for (const dup of sorted.slice(1)) {
        clearIds.add(dup.id);
        repairs.push(unstampForceChargedLog(db, agentId, dup.id));
      }
    }
  }

  for (const log of enriched) {
    if (clearIds.has(log.id) && log.forceCharged) {
      clearForceChargeFields(log);
    }
  }

  if (repairs.length) {
    Promise.allSettled(repairs).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) console.warn(`[callTrace] duplicate force-charge unstamp failed for ${failed} log(s)`);
      else console.log(`[callTrace] Cleared ${repairs.length} duplicate force-charge stamp(s)`);
    });
  }

  return clearIds;
}

/**
 * Reconcile wallet force-charge debits onto call logs that were never stamped
 * (charges before Call Trace started writing forceCharged on the log).
 * Heals Firestore only on exact callSid matches — heuristic matches are display-only
 * so one debit cannot permanently stamp every later call for that agent.
 */
async function enrichLogsFromForceChargeHistory(callLogs) {
  const enriched = (callLogs || []).map((log) => ({ ...log }));
  const agentIds = [...new Set(enriched.map((l) => l?.agentId).filter(Boolean))];
  if (!agentIds.length) return enriched;

  const db = getDb();
  if (!db) return enriched;

  const txsByAgent = {};
  const forcedByAgent = {};
  await Promise.all(agentIds.map(async (agentId) => {
    const [txs, forced] = await Promise.all([
      walletService.getTransactions(agentId, FORCE_CHARGE_TX_LIMIT)
        .then((rows) => (rows || []).filter(isForceChargeTx))
        .catch((err) => {
          console.warn('[callTrace] force-charge tx lookup failed:', agentId, err.message);
          return [];
        }),
      loadAgentForceChargedLogs(db, agentId),
    ]);
    txsByAgent[agentId] = txs;
    forcedByAgent[agentId] = forced;
  }));

  // Fix bad historical stamps before claiming txs / overlaying
  const clearedDupIds = reconcileDuplicateForceChargeStamps(db, enriched, forcedByAgent);
  for (const agentId of agentIds) {
    forcedByAgent[agentId] = (forcedByAgent[agentId] || []).filter((l) => !clearedDupIds.has(l.id));
  }

  const claimedTxIds = new Set();
  for (const agentId of agentIds) {
    for (const id of claimTxsAlreadyStamped(txsByAgent[agentId] || [], forcedByAgent[agentId] || [])) {
      claimedTxIds.add(id);
    }
  }

  const claimedLogIds = new Set(enriched.filter((l) => l.forceCharged).map((l) => l.id));
  const heals = [];

  // Pass 1: exact callSid match (safe to heal)
  for (const log of enriched) {
    if (!log.agentId || log.forceCharged || claimedLogIds.has(log.id) || !log.callSid) continue;
    const match = (txsByAgent[log.agentId] || []).find(
      (tx) => !claimedTxIds.has(txId(tx))
        && tx.metadata?.callSid
        && tx.metadata.callSid === log.callSid,
    );
    if (!match) continue;
    claimedTxIds.add(txId(match));
    claimedLogIds.add(log.id);
    applyForceChargeOverlay(log, match);
    heals.push(healForceChargedLog(db, log, match));
  }

  // Pass 2: leftover no-callSid txs — closest eligible call on THIS trace only.
  // Display overlay only (no Firestore heal) so searching other numbers cannot
  // permanently re-stamp the same debit onto every call.
  for (const agentId of agentIds) {
    const leftoverTxs = (txsByAgent[agentId] || [])
      .filter((tx) => !claimedTxIds.has(txId(tx)) && !tx.metadata?.callSid)
      .sort((a, b) => txCreatedMs(a) - txCreatedMs(b));

    for (const tx of leftoverTxs) {
      const campaignId = tx.metadata?.campaignId || null;
      const txMs = txCreatedMs(tx);
      const candidates = enriched
        .filter((log) => {
          if (log.agentId !== agentId || log.forceCharged || claimedLogIds.has(log.id)) return false;
          if (campaignId && log.campaign && log.campaign !== campaignId) return false;
          if (log.isBillable && Number(log.cost || 0) > 0) return false;
          const callMs = logCreatedMs(log);
          if (!callMs || !txMs) return false;
          if (callMs > txMs + 60_000) return false;
          if (txMs - callMs > FORCE_CHARGE_MATCH_WINDOW_MS) return false;
          return true;
        })
        .sort((a, b) => Math.abs(txMs - logCreatedMs(a)) - Math.abs(txMs - logCreatedMs(b)));

      const pick = candidates[0];
      if (!pick) continue;
      claimedTxIds.add(txId(tx));
      claimedLogIds.add(pick.id);
      applyForceChargeOverlay(pick, tx);
      // intentionally no heal — keep heuristic matches ephemeral
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

/**
 * Build a best-effort timeline from durable Firestore call logs when Redis
 * never recorded ping/route events (pre–Call Trace deploys, flushed keys, etc.).
 */
function synthesizeTimelineFromLogs(callLogs, e164) {
  const events = [];
  for (const log of callLogs || []) {
    const endAt = logCreatedMs(log);
    if (!endAt) continue;
    const durationMs = Math.max(0, (Number(log.duration) || 0) * 1000);
    const startAt = Math.max(0, endAt - durationMs);
    const phone = e164 || log.from || null;
    const base = {
      phone,
      campaignId: log.campaign || null,
      agentId: log.agentId || null,
      callSid: log.callSid || null,
      source: 'call_log',
    };

    events.push({
      ...base,
      id: `clog-in-${log.id}`,
      at: startAt || endAt,
      type: 'incoming',
      to: log.to || null,
      detail: 'Reconstructed from call log',
    });

    if (log.agentId) {
      events.push({
        ...base,
        id: `clog-act-${log.id}`,
        at: (startAt || endAt) + 1,
        type: 'active_snapshot',
        detail: 'Reconstructed from call log',
      });
    }

    const disp = log.disposition ? ` · ${log.disposition}` : '';
    events.push({
      ...base,
      id: `clog-bill-${log.id}`,
      at: endAt,
      type: 'billing',
      costCents: Math.round(Number(log.cost || 0) * 100),
      detail: `${Number(log.duration) || 0}s ${log.isBillable ? 'billable' : 'not billable'}${disp}`,
    });
  }
  events.sort((a, b) => (a.at || 0) - (b.at || 0));
  return events;
}

function mergeTimelineWithLogs(redisTimeline, callLogs, e164) {
  const live = Array.isArray(redisTimeline) ? [...redisTimeline] : [];
  const covered = new Set(
    live.map((e) => e?.callSid).filter(Boolean),
  );
  const missingLogs = (callLogs || []).filter((log) => {
    if (!log?.callSid) return true;
    return !covered.has(log.callSid);
  });
  if (!missingLogs.length) {
    return { timeline: live, timelineSource: live.length ? 'redis' : 'empty' };
  }
  const synthesized = synthesizeTimelineFromLogs(missingLogs, e164);
  if (!live.length) {
    return { timeline: synthesized, timelineSource: synthesized.length ? 'call_logs' : 'empty' };
  }
  const merged = [...live, ...synthesized].sort((a, b) => (a.at || 0) - (b.at || 0));
  return { timeline: merged, timelineSource: 'mixed' };
}

async function assembleTrace(parsed) {
  let last10 = parsed.last10 || null;
  let e164 = parsed.e164 || null;
  let callSid = parsed.callSid || null;

  if (parsed.kind === 'sid') {
    last10 = await callTrace.resolveSid(callSid);
    if (last10) e164 = `+1${last10}`;
  }

  const [redisTimeline, live, rawLogs] = await Promise.all([
    last10 ? callTrace.getTimelineByLast10(last10) : Promise.resolve([]),
    last10 ? callTrace.getLive(last10) : Promise.resolve(null),
    parsed.kind === 'sid'
      ? queryLogs('callSid', callSid)
      : queryLogs('from', e164),
  ]);

  const callLogs = await enrichLogsFromForceChargeHistory(rawLogs);
  const { timeline, timelineSource } = mergeTimelineWithLogs(redisTimeline, callLogs, e164);

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
    timelineSource,
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
