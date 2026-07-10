const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const {
  parseRange,
  readLogsForAgents,
  aggregateByAgent,
  summarize,
  aggregateChartSeries,
  buildUserMetaMap,
  displayNameFromUserData,
} = require('../utils/managerAnalytics');

function serializeManagerDoc(doc) {
  const data = doc.data() || {};
  const managedAgents = Array.isArray(data.managedAgents)
    ? data.managedAgents.filter(Boolean)
    : [];
  const teamName = typeof data.teamName === 'string' ? data.teamName.trim() || null : null;
  return {
    uid: doc.id,
    name: displayNameFromUserData(data),
    email: data.email || null,
    teamName,
    role: data.role || 'manager',
    managedAgents,
    agentCount: managedAgents.length,
  };
}

async function enrichUserProfiles(users) {
  if (!users.length) return users;
  const metaMap = await buildUserMetaMap(users.map((u) => u.uid));
  return users.map((u) => {
    const meta = metaMap.get(u.uid) || {};
    const name = meta.name || u.name || meta.email || u.email || u.uid;
    return {
      ...u,
      name,
      email: meta.email || u.email || null,
    };
  });
}

async function enrichManagerProfiles(managers) {
  return enrichUserProfiles(managers);
}

function isPlatformManager(data) {
  if (!data || data.role !== 'manager') return false;
  if (data.agencyId) return false;
  return true;
}

async function listPlatformManagers() {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const snap = await db.collection('users').where('role', '==', 'manager').get();
  const managers = snap.docs
    .filter((doc) => isPlatformManager(doc.data()))
    .map((doc) => serializeManagerDoc(doc));
  const enriched = await enrichManagerProfiles(managers);
  return enriched.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function getPlatformManager(uid) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const snap = await db.collection('users').doc(String(uid)).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (!isPlatformManager(data)) return null;
  const [enriched] = await enrichManagerProfiles([serializeManagerDoc(snap)]);
  return enriched || null;
}

async function listManagerTeams(query = {}) {
  const { from, end } = parseRange(query);
  const managers = await listPlatformManagers();

  const withStats = await Promise.all(
    managers.map(async (manager) => {
      const agentIds = manager.managedAgents;
      if (!agentIds.length) {
        return {
          ...manager,
          summary: summarize([]),
          from: from.toISOString().slice(0, 10),
          to: end.toISOString().slice(0, 10),
        };
      }
      const rows = await readLogsForAgents(agentIds, from, end);
      return {
        ...manager,
        summary: summarize(rows),
        from: from.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      };
    }),
  );

  return withStats;
}

async function getManagerTeam(uid, query = {}) {
  const manager = await getPlatformManager(uid);
  if (!manager) return null;

  const { from, end } = parseRange(query);
  const agentIds = manager.managedAgents;
  const rows = agentIds.length ? await readLogsForAgents(agentIds, from, end) : [];
  const agentStats = aggregateByAgent(rows);
  const statsByAgent = new Map(agentStats.map((a) => [a.agentId, a]));
  const metaMap = await buildUserMetaMap(agentIds);
  const { byDay, campaigns } = aggregateChartSeries(rows);

  const members = agentIds.map((id) => {
    const meta = metaMap.get(id) || {};
    const stats = statsByAgent.get(id) || {
      agentId: id,
      calls: 0,
      answeredCalls: 0,
      billableCalls: 0,
      totalDuration: 0,
      totalCost: 0,
      answerRate: 0,
      billableRate: 0,
      avgHandleTime: 0,
    };
    return {
      uid: id,
      name: meta.name || id,
      email: meta.email || null,
      role: meta.role || 'agent',
      calls: stats.calls,
      answeredCalls: stats.answeredCalls,
      billableCalls: stats.billableCalls,
      answerRate: stats.answerRate,
      billableRate: stats.billableRate,
      avgHandleTime: stats.avgHandleTime,
      totalCost: stats.totalCost,
    };
  });

  members.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return {
    manager,
    members,
    summary: summarize(rows),
    byDay,
    campaigns,
    from: from.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'firestore.users.callLogs.scoped',
      window: { from: from.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
    },
  };
}

function isPlatformUser(data) {
  if (!data) return false;
  return !data.agencyId;
}

async function listAssignablePlatformAgents({ excludeUid, currentManaged = [] } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const snap = await db.collection('users').get();
  const managedSet = new Set((currentManaged || []).filter(Boolean));
  const exclude = String(excludeUid || '').trim();

  const users = snap.docs
    .filter((doc) => {
      const data = doc.data() || {};
      if (!isPlatformUser(data)) return false;
      if (data.role === 'manager') return false;
      if (doc.id === exclude) return false;
      return true;
    })
    .map((doc) => {
      const data = doc.data() || {};
      return {
        uid: doc.id,
        name: displayNameFromUserData(data),
        email: data.email || null,
        role: data.role || 'agent',
        assigned: managedSet.has(doc.id),
      };
    });

  const enriched = await enrichUserProfiles(users);
  return enriched.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function cleanManagedAgentIds(managerUid, managedAgents, { platformAgentsOnly = false } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const uid = String(managerUid || '').trim();
  if (!uid) throw new Error('Manager uid is required');
  if (!Array.isArray(managedAgents)) throw new Error('managedAgents must be an array of user UIDs');

  const cleaned = [...new Set(
    managedAgents.filter((id) => typeof id === 'string' && id.trim() && id !== uid),
  )];

  if (!cleaned.length) return [];

  const refs = cleaned.map((id) => db.collection('users').doc(id));
  const snaps = await db.getAll(...refs);
  const invalid = snaps.filter((s) => !s.exists).map((s) => s.id);
  if (invalid.length) {
    throw new Error(`Unknown agent UID(s): ${invalid.join(', ')}`);
  }

  if (!platformAgentsOnly) return cleaned;

  const blocked = snaps
    .filter((s) => {
      const data = s.data() || {};
      const role = String(data.role || '');
      if (role === 'admin' || role === 'qa') return true;
      return !isPlatformUser(data) || role === 'manager';
    })
    .map((s) => s.id);
  if (blocked.length) {
    throw new Error('Only platform agents can be added to your team');
  }

  return cleaned;
}

async function updateManagerRoster(managerUid, managedAgents) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const uid = String(managerUid || '').trim();
  const managerSnap = await db.collection('users').doc(uid).get();
  if (!managerSnap.exists) throw new Error('User not found');
  const managerData = managerSnap.data() || {};
  if (!isPlatformManager(managerData)) {
    throw new Error('Only platform managers can update their team roster');
  }

  const cleanedAgents = await cleanManagedAgentIds(uid, managedAgents, { platformAgentsOnly: true });
  const { FieldValue } = admin.firestore;
  await db.collection('users').doc(uid).set(
    {
      role: 'manager',
      managedAgents: cleanedAgents,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { uid, role: 'manager', managedAgents: cleanedAgents };
}

module.exports = {
  listManagerTeams,
  getManagerTeam,
  listPlatformManagers,
  getPlatformManager,
  listAssignablePlatformAgents,
  updateManagerRoster,
  cleanManagedAgentIds,
};
