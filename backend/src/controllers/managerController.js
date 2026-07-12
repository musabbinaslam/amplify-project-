const agentManager = require('../services/agentManager');
const agencyService = require('../services/agencyService');
const {
  parseRange,
  dayKey,
  ratio,
  resolveAgentIds,
  readLogsForAgents,
  aggregateByAgent,
  summarize,
  aggregateChartSeries,
  buildUserMetaMap,
} = require('../utils/managerAnalytics');

// ── Endpoints ────────────────────────────────────────────────────────────────

/** GET /api/manager/my-agents — live status for the manager's agents only. */
async function getMyAgents(req, res) {
  try {
    const allowed = req.managedAgents;
    const agencyId = req.agencyId || null;

    if (Array.isArray(allowed) && allowed.length === 0 && !agencyId) {
      return res.json({
        totalAgents: 0,
        onlineAgents: 0,
        agents: [],
        liveCalls: [],
        pool: { available: [], ringing: [], busy: [] },
        teamName: req.teamName || null,
        live: {
          activeCalls: 0,
          generatedAt: new Date().toISOString(),
          source: 'redis.activeCalls',
          rowCount: 0,
        },
        meta: { generatedAt: new Date().toISOString(), source: 'redis.agentPool+activeCalls' },
      });
    }

    const allowedSet = Array.isArray(allowed) ? new Set(allowed) : null;
    const inScope = (id) => {
      if (agencyId && req.managerRole !== 'admin') return true;
      if (agencyId && req.managerRole === 'admin') return true;
      return !allowedSet || allowedSet.has(id);
    };

    const [overview, activeCalls] = await Promise.all([
      agentManager.getOverview(agencyId),
      agentManager.listActiveCalls(agencyId),
    ]);

    const scopedAgents = (overview.agents || []).filter((a) => inScope(a.id));
    const scopedLiveCalls = (activeCalls || []).filter((c) => inScope(c.agentId));

    // Always include the full allowlist so offline agents still render a row.
    const agentIds = agencyId
      ? await resolveAgentIds(null, agencyId)
      : Array.isArray(allowed)
        ? allowed
        : scopedAgents.map((a) => a.id);
    const metaMap = await buildUserMetaMap([
      ...agentIds,
      ...scopedLiveCalls.map((c) => c.agentId),
    ]);

    const onlineById = new Map(scopedAgents.map((a) => [a.id, a]));
    const agents = (agencyId || Array.isArray(allowed) ? agentIds : scopedAgents.map((a) => a.id)).map((id) => {
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
      teamName: req.teamName || null,
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
    const agencyId = req.agencyId || null;
    if (Array.isArray(allowed) && allowed.length === 0 && !agencyId) {
      return res.json({
        from: from.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
        summary: summarize([]),
        agents: [],
        byDay: [],
        campaigns: [],
        meta: { generatedAt: new Date().toISOString(), source: 'firestore.users.callLogs.scoped' },
      });
    }

    const agentIds = await resolveAgentIds(allowed, agencyId);
    const rows = await readLogsForAgents(agentIds, from, end);
    const agents = aggregateByAgent(rows);
    const metaMap = await buildUserMetaMap(agents.map((a) => a.agentId));
    const { byDay, campaigns } = aggregateChartSeries(rows);

    res.json({
      from: from.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      summary: summarize(rows),
      agents: agents.map((a) => ({
        ...a,
        agentName: metaMap.get(a.agentId)?.name || a.agentId,
        phone: metaMap.get(a.agentId)?.phone || null,
      })),
      byDay,
      campaigns,
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
    const agencyId = req.agencyId || null;
    const limit = Math.min(Number(req.query.limit || 500), 2000);
    const requestedAgent = String(req.query.agentId || '').trim();

    if (Array.isArray(allowed) && allowed.length === 0 && !agencyId) {
      return res.json({ logs: [], meta: { generatedAt: new Date().toISOString(), rowCount: 0 } });
    }

    let agentIds = await resolveAgentIds(allowed, agencyId);
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

/** GET /api/manager/analytics-drilldown — agent trend + recent calls (scoped). */
async function getAnalyticsDrilldown(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const allowed = req.managedAgents;
    const agencyId = req.agencyId || null;
    const agentId = String(req.query.agentId || req.query.id || '').trim();

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    if (Array.isArray(allowed) && allowed.length === 0 && !agencyId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const agentIds = await resolveAgentIds(allowed, agencyId);
    if (!agentIds.includes(agentId)) {
      return res.status(403).json({ error: 'Agent not in your scope' });
    }

    const rows = (await readLogsForAgents([agentId], from, end))
      .filter((r) => r.agentId === agentId);

    const byDay = new Map();
    const outcomes = { completed: 0, missed: 0, billable: 0 };
    rows.forEach((r) => {
      const key = dayKey(r.createdAt);
      if (!key) return;
      if (!byDay.has(key)) byDay.set(key, { day: key, calls: 0, answered: 0, billable: 0 });
      const d = byDay.get(key);
      d.calls += 1;
      if (r.status === 'completed') {
        d.answered += 1;
        outcomes.completed += 1;
      } else {
        outcomes.missed += 1;
      }
      if (r.isBillable) {
        d.billable += 1;
        outcomes.billable += 1;
      }
    });

    const trend = [...byDay.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        day: d.day,
        calls: d.calls,
        answerRate: ratio(d.answered, d.calls),
        billableRate: ratio(d.billable, d.calls),
      }));

    const recentLogs = rows
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 50);

    const metaMap = await buildUserMetaMap([agentId]);
    const agentName = metaMap.get(agentId)?.name || agentId;

    res.json({
      type: 'agent',
      id: agentId,
      agentName,
      summary: {
        calls: rows.length,
        answerRate: ratio(outcomes.completed, rows.length),
        billableRate: ratio(outcomes.billable, rows.length),
        totalCost: rows.reduce((sum, r) => sum + Number(r.cost || 0), 0),
        avgHandleTime: rows.length
          ? Math.round(rows.reduce((sum, r) => sum + Number(r.duration || 0), 0) / rows.length)
          : 0,
      },
      outcomes,
      trend,
      recentLogs: recentLogs.map((r) => ({
        ...r,
        agentName: metaMap.get(r.agentId)?.name || r.agentId,
        phone: metaMap.get(r.agentId)?.phone || null,
      })),
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'firestore.users.callLogs.scoped',
        rowCount: rows.length,
        window: { from: from.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      },
    });
  } catch (err) {
    console.error('[Manager] getAnalyticsDrilldown:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load analytics drilldown' });
  }
}

/** GET /api/manager/assignable-agents — platform agents a manager may add to their team. */
async function getAssignableAgents(req, res) {
  try {
    if (req.managerRole !== 'manager' || req.agencyId) {
      return res.status(403).json({ error: 'Only platform managers can manage a team roster' });
    }

    const managerTeamService = require('../services/managerTeamService');
    const users = await managerTeamService.listAssignablePlatformAgents({
      excludeUid: req.user.uid,
      currentManaged: req.managedAgents,
    });
    res.json({ users });
  } catch (err) {
    console.error('[Manager] getAssignableAgents:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list assignable agents' });
  }
}

/** PATCH /api/manager/team — manager updates their own managedAgents allowlist. */
async function patchMyTeam(req, res) {
  try {
    if (req.managerRole !== 'manager' || req.agencyId) {
      return res.status(403).json({ error: 'Only platform managers can manage a team roster' });
    }

    const { managedAgents } = req.body || {};
    if (!Array.isArray(managedAgents)) {
      return res.status(400).json({ error: 'managedAgents must be an array of user UIDs' });
    }

    const managerTeamService = require('../services/managerTeamService');
    const result = await managerTeamService.updateManagerRoster(req.user.uid, managedAgents);
    console.log(`[Manager] Updated roster managedAgents=${result.managedAgents.length} for ${req.user.uid}`);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Manager] patchMyTeam:', err.message);
    const status = err.message.includes('Unknown agent') || err.message.includes('platform agents')
      ? 400
      : 500;
    res.status(status).json({ error: err.message || 'Failed to update team roster' });
  }
}

module.exports = {
  getMyAgents,
  getAnalytics,
  getCallLogs,
  getAnalyticsDrilldown,
  getAssignableAgents,
  patchMyTeam,
};
