const agentManager = require('../services/agentManager');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const phoneRouteService = require('../services/phoneRouteService');
const admin = require('../config/firebaseAdmin');

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

  // Iterate per user to avoid collectionGroup index requirements
  // Assuming relatively small agent count, this is acceptable for admin analytics.
  // If it ever grows large, we can revisit with a dedicated aggregate collection.
  // eslint-disable-next-line no-restricted-syntax
  for (const userDoc of usersSnap.docs) {
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
      if (t >= fromMs && t <= endMs) {
        out.push(row);
      }
    });
  }

  return out;
}

async function getOverview(req, res) {
  try {
    const overview = await agentManager.getOverview();
    const campaigns = getCampaigns();
    res.json({
      ...overview,
      campaigns,
    });
  } catch (err) {
    console.error('[Admin] getOverview:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load overview' });
  }
}

async function getAgents(req, res) {
  try {
    const { agents } = await agentManager.getOverview();
    res.json({ agents });
  } catch (err) {
    console.error('[Admin] getAgents:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load agents' });
  }
}

async function getCampaignsList(req, res) {
  try {
    res.json({ campaigns: getCampaigns() });
  } catch (err) {
    console.error('[Admin] getCampaignsList:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load campaigns' });
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

async function getCallStats(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const rows = await readLogsInRange(from, end);
    const byDayMap = new Map();
    let totalCalls = 0;
    let answeredCalls = 0;
    let missedCalls = 0;
    let billableCalls = 0;
    let totalDuration = 0;
    let totalCost = 0;

    rows.forEach((r) => {
      const key = dayKey(r.createdAt);
      if (!key) return;
      if (!byDayMap.has(key)) {
        byDayMap.set(key, {
          day: key,
          totalCalls: 0,
          answeredCalls: 0,
          missedCalls: 0,
          billableCalls: 0,
          totalDuration: 0,
          totalCost: 0,
        });
      }
      const target = byDayMap.get(key);
      target.totalCalls += 1;
      totalCalls += 1;
      if (r.status === 'completed') {
        target.answeredCalls += 1;
        answeredCalls += 1;
      } else {
        target.missedCalls += 1;
        missedCalls += 1;
      }
      if (r.isBillable) {
        target.billableCalls += 1;
        billableCalls += 1;
      }
      target.totalDuration += r.duration;
      totalDuration += r.duration;
      target.totalCost += r.cost;
      totalCost += r.cost;
    });

    const byDay = [...byDayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
    res.json({
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
    });
  } catch (err) {
    console.error('[Admin] getCallStats:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load call stats' });
  }
}

async function getCampaignCallStats(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const rows = await readLogsInRange(from, end);
    const byCampaign = new Map();
    rows.forEach((r) => {
      const id = r.campaign || 'unknown';
      if (!byCampaign.has(id)) {
        byCampaign.set(id, {
          campaign: id,
          campaignLabel: r.campaignLabel || id,
          calls: 0,
          answeredCalls: 0,
          billableCalls: 0,
          totalDuration: 0,
          totalCost: 0,
        });
      }
      const target = byCampaign.get(id);
      target.calls += 1;
      if (r.status === 'completed') target.answeredCalls += 1;
      if (r.isBillable) target.billableCalls += 1;
      target.totalDuration += r.duration;
      target.totalCost += r.cost;
    });
    const rowsOut = [...byCampaign.values()].map((r) => ({
      ...r,
      answerRate: r.calls ? Number((r.answeredCalls / r.calls).toFixed(4)) : 0,
      billableRate: r.calls ? Number((r.billableCalls / r.calls).toFixed(4)) : 0,
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    })).sort((a, b) => b.calls - a.calls);
    res.json({ rows: rowsOut });
  } catch (err) {
    console.error('[Admin] getCampaignCallStats:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load campaign stats' });
  }
}

async function getAgentCallStats(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const rows = await readLogsInRange(from, end);
    const byAgent = new Map();
    rows.forEach((r) => {
      const id = r.agentId || 'unknown';
      if (!byAgent.has(id)) {
        byAgent.set(id, {
          agentId: id,
          calls: 0,
          answeredCalls: 0,
          billableCalls: 0,
          totalDuration: 0,
          totalCost: 0,
        });
      }
      const target = byAgent.get(id);
      target.calls += 1;
      if (r.status === 'completed') target.answeredCalls += 1;
      if (r.isBillable) target.billableCalls += 1;
      target.totalDuration += r.duration;
      target.totalCost += r.cost;
    });
    const rowsOut = [...byAgent.values()].map((r) => ({
      ...r,
      answerRate: r.calls ? Number((r.answeredCalls / r.calls).toFixed(4)) : 0,
      billableRate: r.calls ? Number((r.billableCalls / r.calls).toFixed(4)) : 0,
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    })).sort((a, b) => b.calls - a.calls);
    res.json({ rows: rowsOut });
  } catch (err) {
    console.error('[Admin] getAgentCallStats:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load agent stats' });
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
  getOverview,
  getAgents,
  getCampaignsList,
  getCallStats,
  getCampaignCallStats,
  getAgentCallStats,
  getLiveCalls,
  listDids,
  createDid,
  patchDid,
  deleteDid,
};
