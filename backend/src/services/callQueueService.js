const { redisClient } = require('../config/redis');
const { poolSegment, normalizeAgencyId } = require('../utils/tenancy');

const QUEUE_TTL_SEC = 120;

function queueKey(campaignId, agencyId) {
  return `callqueue:${poolSegment(agencyId)}:${campaignId}`;
}

async function enqueueCall(callSid, { campaignId, agencyId, callerState }) {
  if (!callSid) return;
  const key = queueKey(campaignId, agencyId);
  const payload = JSON.stringify({
    callSid,
    campaignId,
    agencyId: normalizeAgencyId(agencyId),
    callerState: callerState || null,
    enqueuedAt: Date.now(),
  });
  await redisClient.lPush(key, payload);
  await redisClient.expire(key, QUEUE_TTL_SEC);
}

async function dequeueCall(campaignId, agencyId) {
  const key = queueKey(campaignId, agencyId);
  const raw = await redisClient.rPop(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function queueDepth(campaignId, agencyId) {
  const key = queueKey(campaignId, agencyId);
  return Number(await redisClient.lLen(key)) || 0;
}

module.exports = {
  enqueueCall,
  dequeueCall,
  queueDepth,
  queueKey,
};
