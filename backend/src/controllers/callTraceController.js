const { getDb } = require('../config/firestoreDb');
const { cached } = require('../utils/readCache');
const callTrace = require('../services/callTraceService');

const CACHE_TTL_SEC = 8;
const LOG_LIMIT = 50;
const LOG_FIELDS = [
  'from', 'to', 'callSid', 'campaign', 'campaignLabel', 'agentId', 'status',
  'duration', 'isBillable', 'cost', 'createdAt', 'timestamp', 'disposition',
  'recordingSid', 'recordingUrl',
];

function toIso(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value || null;
}

function mapLogDoc(doc) {
  const data = doc.data() || {};
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
    recordingSid: data.recordingSid || null,
    recordingUrl: data.recordingUrl || null,
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

async function loadAgentMeta(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return {};
  const db = getDb();
  if (!db) return {};
  const snaps = await db.getAll(
    ...unique.map((id) => db.collection('users').doc(id)),
    { fieldMask: ['fullName', 'displayName', 'name', 'email', 'agentName'] },
  );
  const out = {};
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    const d = snap.data() || {};
    out[snap.id] = d.fullName || d.displayName || d.name || d.agentName || d.email || snap.id;
  });
  return out;
}

async function assembleTrace(parsed) {
  let last10 = parsed.last10 || null;
  let e164 = parsed.e164 || null;
  let callSid = parsed.callSid || null;

  if (parsed.kind === 'sid') {
    last10 = await callTrace.resolveSid(callSid);
    if (last10) e164 = `+1${last10}`;
  }

  const [timeline, live, callLogs] = await Promise.all([
    last10 ? callTrace.getTimelineByLast10(last10) : Promise.resolve([]),
    last10 ? callTrace.getLive(last10) : Promise.resolve(null),
    parsed.kind === 'sid'
      ? queryLogs('callSid', callSid)
      : queryLogs('from', e164),
  ]);

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
