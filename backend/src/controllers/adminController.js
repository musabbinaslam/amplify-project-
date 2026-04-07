const agentManager = require('../services/agentManager');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const phoneRouteService = require('../services/phoneRouteService');
const admin = require('../config/firebaseAdmin');
const ANALYTICS_CACHE_TTL_MS = 30000;
const READ_CONCURRENCY = 10;
const analyticsCache = new Map();

function getCampaigns() {
  return Object.entries(CAMPAIGN_CONFIG).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    buffer: cfg.buffer,
    price: cfg.price,
  }));
}

function parseRange(query) {
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

function getCallCreatedAt(log) {
  if (typeof log.createdAt === 'string') return log.createdAt;
  if (log.createdAt?.toDate) return log.createdAt.toDate().toISOString();
  if (typeof log.timestamp === 'string') return log.timestamp;
  return null;
}

function normalizeCall(doc) {
  const data = doc.data() || {};
  const createdAt = getCallCreatedAt(data);
  return {
    id: doc.id,
    agentId: data.agentId || null,
    campaign: data.campaign || 'unknown',
    campaignLabel: data.campaignLabel || data.campaign || 'unknown',
    status: data.status || 'unknown',
    duration: Number(data.duration || 0),
    isBillable: Boolean(data.isBillable),
    cost: Number(data.cost || 0),
    createdAt,
  };
}

async function readLogsInRange(from, end) {
  if (!admin) throw new Error('Database service unavailable');
  const db = admin.firestore();
  const fromMs = from.getTime();
  const endMs = end.getTime();
  const usersSnap = await db.collection('users').get();
  const out = [];
  const docs = usersSnap.docs || [];
  let cursor = 0;

  async function worker() {
    while (cursor < docs.length) {
      const idx = cursor;
      cursor += 1;
      const userDoc = docs[idx];
      // eslint-disable-next-line no-await-in-loop
      const callsSnap = await userDoc.ref
        .collection('callLogs')
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();
      callsSnap.docs.forEach((doc) => {
        const row = normalizeCall(doc);
        if (!row.createdAt) return;
        const t = new Date(row.createdAt).getTime();
        if (Number.isNaN(t)) return;
        if (t >= fromMs && t <= endMs) out.push(row);
      });
    }
  }

  const workers = Array.from(
    { length: Math.min(READ_CONCURRENCY, Math.max(1, docs.length)) },
    () => worker(),
  );
  await Promise.all(workers);

  return out;
}

function aggregateAnalytics(rows, from, end) {
  const byDayMap = new Map();
  const byCampaign = new Map();
  const byAgent = new Map();
  let totalCalls = 0;
  let answeredCalls = 0;
  let missedCalls = 0;
  let billableCalls = 0;
  let totalDuration = 0;
  let totalCost = 0;

  rows.forEach((r) => {
    const dKey = dayKey(r.createdAt);
    if (dKey) {
      if (!byDayMap.has(dKey)) {
        byDayMap.set(dKey, {
          day: dKey,
          totalCalls: 0,
          answeredCalls: 0,
          missedCalls: 0,
          billableCalls: 0,
          totalDuration: 0,
          totalCost: 0,
        });
      }
      const d = byDayMap.get(dKey);
      d.totalCalls += 1;
      if (r.status === 'completed') d.answeredCalls += 1;
      else d.missedCalls += 1;
      if (r.isBillable) d.billableCalls += 1;
      d.totalDuration += r.duration;
      d.totalCost += r.cost;
    }

    totalCalls += 1;
    if (r.status === 'completed') answeredCalls += 1;
    else missedCalls += 1;
    if (r.isBillable) billableCalls += 1;
    totalDuration += r.duration;
    totalCost += r.cost;

    const campaignId = r.campaign || 'unknown';
    if (!byCampaign.has(campaignId)) {
      byCampaign.set(campaignId, {
        campaign: campaignId,
        campaignLabel: r.campaignLabel || campaignId,
        calls: 0,
        answeredCalls: 0,
        billableCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      });
    }
    const c = byCampaign.get(campaignId);
    c.calls += 1;
    if (r.status === 'completed') c.answeredCalls += 1;
    if (r.isBillable) c.billableCalls += 1;
    c.totalDuration += r.duration;
    c.totalCost += r.cost;

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

  const byDay = [...byDayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const campaigns = [...byCampaign.values()]
    .map((r) => ({
      ...r,
      answerRate: r.calls ? Number((r.answeredCalls / r.calls).toFixed(4)) : 0,
      billableRate: r.calls ? Number((r.billableCalls / r.calls).toFixed(4)) : 0,
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);
  const agents = [...byAgent.values()]
    .map((r) => ({
      ...r,
      answerRate: r.calls ? Number((r.answeredCalls / r.calls).toFixed(4)) : 0,
      billableRate: r.calls ? Number((r.billableCalls / r.calls).toFixed(4)) : 0,
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  return {
    from: from.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    summary: {
      totalCalls,
      answeredCalls,
      missedCalls,
      billableCalls,
      totalDuration,
      totalCost,
      answerRate: totalCalls ? Number((answeredCalls / totalCalls).toFixed(4)) : 0,
      billableRate: totalCalls ? Number((billableCalls / totalCalls).toFixed(4)) : 0,
    },
    byDay,
    campaigns,
    agents,
  };
}

function cacheKey(from, end) {
  return `${from.toISOString().slice(0, 10)}|${end.toISOString().slice(0, 10)}`;
}

async function getAnalyticsBundle(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const key = cacheKey(from, end);
    const cached = analyticsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ ...cached.payload, cached: true });
    }

    const rows = await readLogsInRange(from, end);
    const payload = aggregateAnalytics(rows, from, end);
    analyticsCache.set(key, {
      payload,
      expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
    });
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[Admin] getAnalyticsBundle:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load analytics bundle' });
  }
}

async function getOverviewLite(req, res) {
  try {
    const overview = await agentManager.getOverview();
    res.json({
      totalAgents: overview.totalAgents || 0,
      agents: overview.agents || [],
      pool: overview.pool || { available: [], ringing: [], busy: [] },
      byCampaign: overview.byCampaign || {},
      campaigns: getCampaigns(),
    });
  } catch (err) {
    console.error('[Admin] getOverviewLite:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load overview lite' });
  }
}

async function listDids(req, res) {
  try {
    const routes = await phoneRouteService.listPhoneRoutes();
    res.json({ dids: routes });
  } catch (err) {
    console.error('[Admin] listDids:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load phone routes' });
  }
}

async function createDid(req, res) {
  try {
    const { phoneE164, campaignId, label, active } = req.body || {};
    const row = await phoneRouteService.createPhoneRoute({
      phoneE164,
      campaignId,
      label,
      active,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('[Admin] createDid:', err.message);
    res.status(400).json({ error: err.message || 'Failed to create route' });
  }
}

async function patchDid(req, res) {
  try {
    const { id } = req.params;
    const row = await phoneRouteService.updatePhoneRoute(id, req.body || {});
    res.json(row);
  } catch (err) {
    console.error('[Admin] patchDid:', err.message);
    const status = err.message === 'Route not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to update route' });
  }
}

async function deleteDid(req, res) {
  try {
    const { id } = req.params;
    const out = await phoneRouteService.deletePhoneRoute(id);
    res.json(out);
  } catch (err) {
    console.error('[Admin] deleteDid:', err.message);
    const status = err.message === 'Route not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to delete route' });
  }
}

async function getLiveCalls(req, res) {
  try {
    const overview = await agentManager.getOverview();
    const busy = (overview.agents || []).filter((a) => a.pool === 'busy');
    const rows = busy.map((a) => ({
      agentId: a.id,
      campaignId: a.campaignId,
      status: a.status || 'BUSY',
      state: 'in_call',
      startedAt: null,
    }));
    res.json({ rows });
  } catch (err) {
    console.error('[Admin] getLiveCalls:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load live calls' });
  }
}

module.exports = {
  getOverviewLite,
  getAnalyticsBundle,
  getLiveCalls,
  listDids,
  createDid,
  patchDid,
  deleteDid,
};
