const agentManager = require('../services/agentManager');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

const READ_CONCURRENCY = 10;

// ── Date range parsing (mirrors adminController.parseRange) ──────────────────
function parseRange(query = {}) {
  const now = new Date();
  const end = query.to ? new Date(`${query.to}T23:59:59.999Z`) : now;
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(end.getTime() - (6 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime()) || from > end) {
    throw new Error('Invalid date range');
  }
  return { from, end };
}

function dayKey(isoLike) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

function getCallCreatedAt(data) {
  if (typeof data.createdAt === 'string') return data.createdAt;
  if (data.createdAt?.toDate) return data.createdAt.toDate().toISOString();
  if (typeof data.timestamp === 'string') return data.timestamp;
  return null;
}

function normalizeCall(doc, fallbackAgentId) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    agentId: data.agentId || fallbackAgentId || null,
    callSid: data.callSid || null,
    campaign: data.campaign || 'unknown',
    campaignLabel: data.campaignLabel || data.campaign || 'unknown',
    status: data.status || 'unknown',
    duration: Number(data.duration || 0),
    isBillable: Boolean(data.isBillable),
    cost: Number(data.cost || 0),
    disposition: data.disposition || null,
    recordingUrl: data.recordingUrl || null,
    recordingSid: data.recordingSid || null,
    refunded: Boolean(data.refunded),
    refundReason: data.refundReason || null,
    contestId: data.contestId || null,
    contestStatus: data.contestStatus || null,
    createdAt: getCallCreatedAt(data),
  };
}

/**
 * Resolve the concrete list of agent UIDs this request is permitted to read.
 *   - allowed === null → admin: every user in the system.
 *   - allowed === [...] → manager: exactly their allowlist (deduped).
 */
async function resolveAgentIds(allowed) {
  if (Array.isArray(allowed)) return [...new Set(allowed.filter(Boolean))];
  // Admin (null): fan out across all users.
  const db = getDb();
  const usersSnap = await db.collection('users').select().get();
  return usersSnap.docs.map((d) => d.id);
}

/**
 * Read callLogs for a fixed set of agent UIDs within a date range. Scoped by
 * design — we never touch users outside the provided list.
 */
async function readLogsForAgents(agentIds, from, end) {
  if (!admin) throw new Error('Database service unavailable');
  if (!agentIds.length) return [];
  const db = getDb();
  const fromMs = from.getTime();
  const endMs = end.getTime();
  const out = [];
  let cursor = 0;

  async function worker() {
    while (cursor < agentIds.length) {
      const idx = cursor;
      cursor += 1;
      const agentId = agentIds[idx];
      // eslint-disable-next-line no-await-in-loop
      const callsSnap = await db
        .collection('users')
        .doc(agentId)
        .collection('callLogs')
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();
      callsSnap.docs.forEach((doc) => {
        const row = normalizeCall(doc, agentId);
        if (!row.createdAt) return;
        const t = new Date(row.createdAt).getTime();
        if (Number.isNaN(t)) return;
        if (t >= fromMs && t <= endMs) out.push(row);
      });
    }
  }

  const workers = Array.from(
    { length: Math.min(READ_CONCURRENCY, Math.max(1, agentIds.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

/** Per-agent aggregation for the performance table. */
function aggregateByAgent(rows) {
  const byAgent = new Map();
  rows.forEach((r) => {
    const agentId = r.agentId || 'unknown';
    if (!byAgent.has(agentId)) {
      byAgent.set(agentId, {
        agentId,
        calls: 0,
        answeredCalls: 0,
        billableCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      });
    }
    const a = byAgent.get(agentId);
    a.calls += 1;
    if (r.status === 'completed') a.answeredCalls += 1;
    if (r.isBillable) a.billableCalls += 1;
    a.totalDuration += r.duration;
    a.totalCost += r.cost;
  });
  return [...byAgent.values()]
    .map((r) => ({
      ...r,
      answerRate: ratio(r.answeredCalls, r.calls),
      billableRate: ratio(r.billableCalls, r.calls),
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);
}

function summarize(rows) {
  let totalCalls = 0;
  let answeredCalls = 0;
  let missedCalls = 0;
  let billableCalls = 0;
  let totalDuration = 0;
  let totalCost = 0;
  rows.forEach((r) => {
    totalCalls += 1;
    if (r.status === 'completed') answeredCalls += 1;
    else missedCalls += 1;
    if (r.isBillable) billableCalls += 1;
    totalDuration += r.duration;
    totalCost += r.cost;
  });
  return {
    totalCalls,
    answeredCalls,
    missedCalls,
    billableCalls,
    totalDuration,
    totalCost,
    answerRate: ratio(answeredCalls, totalCalls),
    billableRate: ratio(billableCalls, totalCalls),
  };
}

/** Name/phone lookup for a fixed set of agent UIDs (scoped subset of admin's helper). */
async function buildUserMetaMap(agentIds = []) {
  const ids = [...new Set((agentIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const db = getDb();
  const refs = ids.map((id) => db.collection('users').doc(id));
  const snaps = await db.getAll(...refs);
  const map = new Map();
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    const data = snap.data() || {};
    const firstLast = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    const name =
      data.fullName ||
      data.displayName ||
      data.name ||
      data.agentName ||
      firstLast ||
      data.email ||
      null;
    const phone = data.phoneNumber || data.phone || data.onboarding?.phone || null;
    map.set(snap.id, { name, phone });
  });

  // Backfill names/phones missing from Firestore using Firebase Auth (mirrors adminController).
  const missing = ids.filter((id) => {
    const entry = map.get(id);
    return !entry || !entry.name || !entry.phone;
  });
  if (missing.length && admin) {
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      // eslint-disable-next-line no-await-in-loop
      const out = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
      out.users.forEach((u) => {
        const existing = map.get(u.uid) || {};
        map.set(u.uid, {
          name: existing.name || u.displayName || u.email || null,
          phone: existing.phone || u.phoneNumber || null,
        });
      });
    }
  }
  return map;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/** GET /api/manager/my-agents — live status for the manager's agents only. */
async function getMyAgents(req, res) {
  try {
    const allowed = req.managedAgents; // null = admin, [] = none, [...] = scoped
    if (Array.isArray(allowed) && allowed.length === 0) {
      return res.json({ totalAgents: 0, agents: [], liveCalls: [], pool: { available: [], ringing: [], busy: [] } });
    }

    const allowedSet = Array.isArray(allowed) ? new Set(allowed) : null;
    const inScope = (id) => !allowedSet || allowedSet.has(id);

    const [overview, activeCalls] = await Promise.all([
      agentManager.getOverview(),
      agentManager.listActiveCalls(),
    ]);

    const scopedAgents = (overview.agents || []).filter((a) => inScope(a.id));
    const scopedLiveCalls = (activeCalls || []).filter((c) => inScope(c.agentId));

    // Always include the full allowlist so offline agents still render a row.
    const agentIds = Array.isArray(allowed)
      ? allowed
      : scopedAgents.map((a) => a.id);
    const metaMap = await buildUserMetaMap([
      ...agentIds,
      ...scopedLiveCalls.map((c) => c.agentId),
    ]);

    const onlineById = new Map(scopedAgents.map((a) => [a.id, a]));
    const agents = (Array.isArray(allowed) ? allowed : scopedAgents.map((a) => a.id)).map((id) => {
      const live = onlineById.get(id);
      return {
        id,
        agentName: metaMap.get(id)?.name || id,
        phone: metaMap.get(id)?.phone || null,
        online: Boolean(live),
        status: live?.status || 'OFFLINE',
        pool: live?.pool || null,
        campaignId: live?.campaignId || null,
        licensedStates: live?.licensedStates || [],
      };
    });

    res.json({
      totalAgents: agents.length,
      onlineAgents: scopedAgents.length,
      agents,
      pool: overview.pool || { available: [], ringing: [], busy: [] },
      liveCalls: scopedLiveCalls.map((row) => ({
        ...row,
        agentName: metaMap.get(row.agentId)?.name || row.agentId,
        phone: metaMap.get(row.agentId)?.phone || null,
      })),
      live: {
        activeCalls: scopedLiveCalls.length,
        generatedAt: new Date().toISOString(),
        source: 'redis.activeCalls',
        rowCount: scopedLiveCalls.length,
      },
      meta: { generatedAt: new Date().toISOString(), source: 'redis.agentPool+activeCalls' },
    });
  } catch (err) {
    console.error('[Manager] getMyAgents:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load agents' });
  }
}

/** GET /api/manager/analytics — performance stats scoped to the manager's agents. */
async function getAnalytics(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const allowed = req.managedAgents;
    if (Array.isArray(allowed) && allowed.length === 0) {
      return res.json({
        from: from.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
        summary: summarize([]),
        agents: [],
        meta: { generatedAt: new Date().toISOString(), source: 'firestore.users.callLogs.scoped' },
      });
    }

    const agentIds = await resolveAgentIds(allowed);
    const rows = await readLogsForAgents(agentIds, from, end);
    const agents = aggregateByAgent(rows);
    const metaMap = await buildUserMetaMap(agents.map((a) => a.agentId));

    res.json({
      from: from.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      summary: summarize(rows),
      agents: agents.map((a) => ({
        ...a,
        agentName: metaMap.get(a.agentId)?.name || a.agentId,
        phone: metaMap.get(a.agentId)?.phone || null,
      })),
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'firestore.users.callLogs.scoped',
        window: { from: from.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      },
    });
  } catch (err) {
    console.error('[Manager] getAnalytics:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load analytics' });
  }
}

/** GET /api/manager/call-logs — read-only call history scoped to the manager's agents. */
async function getCallLogs(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const allowed = req.managedAgents;
    const limit = Math.min(Number(req.query.limit || 500), 2000);
    const requestedAgent = String(req.query.agentId || '').trim();

    if (Array.isArray(allowed) && allowed.length === 0) {
      return res.json({ logs: [], meta: { generatedAt: new Date().toISOString(), rowCount: 0 } });
    }

    let agentIds = await resolveAgentIds(allowed);
    // Optional single-agent filter — but never escape the allowlist.
    if (requestedAgent) {
      agentIds = agentIds.filter((id) => id === requestedAgent);
      if (!agentIds.length) {
        return res.status(403).json({ error: 'Agent not in your team' });
      }
    }

    const rows = await readLogsForAgents(agentIds, from, end);
    rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const limited = rows.slice(0, limit);
    const metaMap = await buildUserMetaMap(limited.map((r) => r.agentId));

    res.json({
      logs: limited.map((r) => ({
        ...r,
        agentName: metaMap.get(r.agentId)?.name || r.agentId,
        phone: metaMap.get(r.agentId)?.phone || null,
      })),
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'firestore.users.callLogs.scoped',
        rowCount: rows.length,
        returned: limited.length,
        window: { from: from.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      },
    });
  } catch (err) {
    console.error('[Manager] getCallLogs:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load call logs' });
  }
}

module.exports = {
  getMyAgents,
  getAnalytics,
  getCallLogs,
};
