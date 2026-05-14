/**
 * clearGhostAgent.js
 * Usage: node tools/clearGhostAgent.js <agentId>
 *
 * Manually evicts a ghost/stale agent from every Redis key so they can
 * log back in cleanly without showing as IN_CALL / BUSY on the admin dashboard.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { redisClient, connectRedis } = require('../src/config/redis');
const { CAMPAIGN_CONFIG } = require('../src/config/pricing');

async function clearGhostAgent(agentId) {
  if (!agentId) {
    console.error('Usage: node tools/clearGhostAgent.js <agentId>');
    process.exit(1);
  }

  console.log(`\n🔧 Clearing ghost agent: ${agentId}\n`);

  // 1. Remove from every campaign pool sorted set
  const campaignIds = Object.keys(CAMPAIGN_CONFIG);
  for (const campaignId of campaignIds) {
    const removed = await redisClient.zRem(`pool:${campaignId}`, agentId);
    if (removed) console.log(`  ✅ Removed from pool:${campaignId}`);
  }

  // 2. Remove from ringing / busy sets
  const ringingRemoved = await redisClient.sRem('agents:ringing', agentId);
  const busyRemoved    = await redisClient.sRem('agents:busy',    agentId);
  if (ringingRemoved) console.log('  ✅ Removed from agents:ringing');
  if (busyRemoved)    console.log('  ✅ Removed from agents:busy');

  // 3. Delete agent data hash entry
  const dataRemoved = await redisClient.hDel('agents:data', agentId);
  if (dataRemoved) console.log('  ✅ Deleted agents:data entry');

  // 4. Delete heartbeat key
  const hbRemoved = await redisClient.del(`agent:heartbeat:${agentId}`);
  if (hbRemoved) console.log('  ✅ Deleted agent:heartbeat key');

  // 5. Remove from heartbeats sorted set
  const hbZRemoved = await redisClient.zRem('agents:heartbeats', agentId);
  if (hbZRemoved) console.log('  ✅ Removed from agents:heartbeats sorted set');

  // 6. Delete active call record (the key cause of the ghost IN_CALL state)
  const callRemoved = await redisClient.hDel('activecalls:data', agentId);
  if (callRemoved) console.log('  ✅ Deleted activecalls:data entry (was the IN_CALL ghost)');

  console.log(`\n✅ Done. Agent ${agentId} fully cleared from Redis.\n`);
  console.log('They can now log in and go live normally.\n');
  process.exit(0);
}

const agentId = process.argv[2] || 'h4l9bs28gXMPT9KnrX56mS3bbKnW2';

(async () => {
  await connectRedis();
  await clearGhostAgent(agentId);
})().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
