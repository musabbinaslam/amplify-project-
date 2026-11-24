const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const firebaseAdminPath = path.resolve(__dirname, '../src/config/firebaseAdmin.js');
const firestoreDbPath = path.resolve(__dirname, '../src/config/firestoreDb.js');
const callLogServicePath = path.resolve(__dirname, '../src/services/callLogService.js');
const callTracePath = path.resolve(__dirname, '../src/services/callTraceService.js');
const walletServicePath = path.resolve(__dirname, '../src/services/walletService.js');
const readCachePath = path.resolve(__dirname, '../src/utils/readCache.js');
const pricingPath = path.resolve(__dirname, '../src/config/pricing.js');

function loadCallLogService() {
  delete require.cache[firebaseAdminPath];
  delete require.cache[firestoreDbPath];
  delete require.cache[callLogServicePath];
  delete require.cache[callTracePath];
  delete require.cache[walletServicePath];
  delete require.cache[readCachePath];

  require.cache[firebaseAdminPath] = { exports: null };
  require.cache[firestoreDbPath] = { exports: { getDb: () => null } };
  require.cache[callTracePath] = { exports: { trace() {}, clearLiveSoon() {} } };
  require.cache[walletServicePath] = { exports: { deductCredits: async () => 9999 } };
  require.cache[readCachePath] = { exports: { invalidateNamespaceSoon() {} } };

  return require(callLogServicePath);
}

function campaignWithBuffer() {
  const { CAMPAIGN_CONFIG } = require(pricingPath);
  const campaignId = Object.keys(CAMPAIGN_CONFIG).find((id) => {
    const cfg = CAMPAIGN_CONFIG[id];
    return cfg && cfg.isRaw !== true && Number(cfg.buffer) > 0;
  });
  assert.ok(campaignId, 'expected a non-raw CAMPAIGN_CONFIG campaign with buffer > 0');
  return { campaignId, buffer: Number(CAMPAIGN_CONFIG[campaignId].buffer) };
}

test('logCall billing ignores a passed isBillable and uses CAMPAIGN_CONFIG', async () => {
  const callLogService = loadCallLogService();
  const { campaignId, buffer } = campaignWithBuffer();

  const base = {
    callSid: 'CA_billing_args',
    dialCallSid: null,
    agentId: 'agent_billing_args',
    campaignId,
    from: '+15551112222',
    to: '+15553334444',
    recordingUrl: null,
    recordingSid: null,
  };

  const belowBuffer = await callLogService.logCall({
    ...base,
    callSid: 'CA_billing_args_below',
    duration: buffer - 1,
    status: 'completed',
    isBillable: true,
  });
  assert.equal(belowBuffer.isBillable, false);

  const atBuffer = await callLogService.logCall({
    ...base,
    callSid: 'CA_billing_args_at',
    duration: buffer,
    status: 'completed',
    isBillable: false,
  });
  assert.equal(atBuffer.isBillable, true);
});
