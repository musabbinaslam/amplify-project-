const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Test 1: agentManager routing state retention for missed calls
test('agentManager preserves call:route and dialed tracking across clearPendingCall', async () => {
  const redisStore = new Map();
  const redisSets = new Map();

  const mockRedisClient = {
    get: async (key) => redisStore.get(key) || null,
    setEx: async (key, ttl, val) => { redisStore.set(key, String(val)); },
    del: async (key) => { redisStore.delete(key); },
    sAdd: async (key, val) => {
      if (!redisSets.has(key)) redisSets.set(key, new Set());
      redisSets.get(key).add(String(val));
    },
    sIsMember: async (key, val) => {
      const s = redisSets.get(key);
      return s ? s.has(String(val)) : false;
    },
    expire: async () => {},
    hGet: async () => null,
    hDel: async () => {},
  };

  const agentManagerPath = path.resolve(__dirname, '../src/services/agentManager.js');
  const redisConfigPath = path.resolve(__dirname, '../src/config/redis.js');

  delete require.cache[agentManagerPath];
  delete require.cache[redisConfigPath];
  require.cache[redisConfigPath] = { exports: { redisClient: mockRedisClient } };

  const agentManager = require(agentManagerPath);

  const agentId = 'agent_test_123';
  const callSid = 'CA_test_parent_456';

  // Mark agent dialing
  await agentManager.markAgentDialing(agentId, {
    callSid,
    from: '+15551234567',
    to: '+15559876543',
    campaignId: 'fe_inbounds_short',
  });

  // Verify route and dialed_agents are set
  assert.equal(await redisStore.get(`call:route:${callSid}`), agentId);
  assert.equal(await mockRedisClient.sIsMember(`call:dialed_agents:${callSid}`, agentId), true);

  // Agent was dialed
  assert.equal(await agentManager.wasDialedForCall(agentId, callSid), true);

  // Now simulate dial status terminal / clearPendingCall
  await agentManager.clearPendingCall(agentId, callSid);

  // Pending call is removed
  assert.equal(Boolean(redisStore.get(`agent:pendingcall:${agentId}`)), false);

  // BUT call:route is PRESERVED so completion webhook and audit logs work!
  assert.equal(await redisStore.get(`call:route:${callSid}`), agentId);
  assert.equal(await agentManager.wasDialedForCall(agentId, callSid), true);

  // Resolving call owner still returns agentId
  assert.equal(await agentManager.resolveCallOwner(callSid, null), agentId);
});

// Test 2: voiceController.handleCallCompleted logs missed calls properly
test('voiceController.handleCallCompleted saves call log with status missed and 0 duration', async () => {
  const loggedCalls = [];
  const forcedOfflineEmits = [];

  const mockCallLogService = {
    logCall: async (data) => {
      loggedCalls.push(data);
      return { id: 'call_log_doc_1', ...data };
    },
    updateCallLogBySid: async () => true,
    findCallLogByCallSid: async () => null,
  };

  const mockAgentManager = {
    getActiveCall: async () => null,
    getAgentState: async () => ({ status: 'AVAILABLE', sessionId: 'sess_1' }),
    clearActiveCall: async () => {},
    removeAgent: async () => true,
    releaseAgent: async () => true,
    markAgentRejectedCall: async () => {},
    resolveCallOwner: async (callSid, qAgentId) => qAgentId || 'agent_abc',
    findAgentIdByCallSid: async () => null,
    wasDialedForCall: async () => true,
    getCallInfo: async () => ({
      from: '+15551112222',
      to: '+15553334444',
      campaignId: 'fe_inbounds_short',
      agentId: 'agent_abc',
    }),
    releaseStaleRingingForCall: async () => 0,
    setAgentWrapUp: async () => {},
    upsertActiveCall: async () => {},
  };

  const mockSocketRegistry = {
    emitToAgent: async (agentId, event, data) => {
      forcedOfflineEmits.push({ agentId, event, data });
      return true;
    },
  };

  const voiceControllerPath = path.resolve(__dirname, '../src/controllers/voiceController.js');
  const agentManagerPath = path.resolve(__dirname, '../src/services/agentManager.js');
  const callLogServicePath = path.resolve(__dirname, '../src/services/callLogService.js');
  const socketRegistryPath = path.resolve(__dirname, '../src/sockets/socketRegistry.js');

  delete require.cache[voiceControllerPath];
  delete require.cache[agentManagerPath];
  delete require.cache[callLogServicePath];
  delete require.cache[socketRegistryPath];

  require.cache[agentManagerPath] = { exports: mockAgentManager };
  require.cache[callLogServicePath] = { exports: mockCallLogService };
  require.cache[socketRegistryPath] = { exports: mockSocketRegistry };

  const voiceController = require(voiceControllerPath);

  const req = {
    query: {
      campaign: 'fe_inbounds_short',
      agentId: 'agent_abc',
    },
    body: {
      CallSid: 'CA_missed_call_789',
      DialCallSid: 'CA_leg_000',
      DialCallStatus: 'no-answer',
      DialCallDuration: '0',
      CallStatus: 'completed',
      From: '+15551112222',
      To: '+15553334444',
    },
  };

  let sentBody = null;
  let sentStatus = null;
  const res = {
    set: () => res,
    send: (body) => { sentBody = body; },
    sendStatus: (status) => { sentStatus = status; },
    status: (s) => ({ json: (b) => { sentStatus = s; sentBody = b; } }),
  };

  await voiceController.handleCallCompleted(req, res);

  // Assert that call was logged
  assert.equal(loggedCalls.length, 1);
  const log = loggedCalls[0];
  assert.equal(log.callSid, 'CA_missed_call_789');
  assert.equal(log.agentId, 'agent_abc');
  assert.equal(log.status, 'missed');
  assert.equal(log.duration, 0);
  assert.equal(log.isBillable, false);

  // Agent was forced offline
  assert.equal(forcedOfflineEmits.length, 1);
  assert.equal(forcedOfflineEmits[0].agentId, 'agent_abc');
  assert.equal(forcedOfflineEmits[0].event, 'agent:forced_offline');
});
