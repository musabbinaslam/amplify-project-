#!/usr/bin/env node
/**
 * Lightweight load-test helper for agency routing pools.
 * Simulates N concurrent routing attempts against Redis (no Twilio).
 *
 *   node backend/scripts/load_test_concurrent_calls.js --agents 300 --concurrent 200 --campaign fe_tv_calls
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const agentManager = require('../src/services/agentManager');
const { connectRedis } = require('../src/config/redis');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { agents: 300, concurrent: 200, campaign: 'fe_tv_calls', agencyId: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--agents') out.agents = Number(args[i + 1]) || out.agents;
    if (args[i] === '--concurrent') out.concurrent = Number(args[i + 1]) || out.concurrent;
    if (args[i] === '--campaign') out.campaign = args[i + 1] || out.campaign;
    if (args[i] === '--agencyId') out.agencyId = args[i + 1] || null;
  }
  return out;
}

async function main() {
  const { agents, concurrent, campaign, agencyId } = parseArgs();
  await connectRedis();

  console.log(`Registering ${agents} mock agents on ${campaign} (agency=${agencyId || 'platform'})...`);
  const registerStart = Date.now();
  await Promise.all(
    Array.from({ length: agents }, (_, i) => agentManager.registerAgent(`loadtest-agent-${i}`, {
      campaign,
      agencyId,
      licensedStates: [],
      sessionId: `load-${i}-${Date.now()}`,
    })),
  );
  console.log(`Registered in ${Date.now() - registerStart}ms`);

  console.log(`Firing ${concurrent} concurrent findAndLockAvailableAgent calls...`);
  const routeStart = Date.now();
  const results = await Promise.all(
    Array.from({ length: concurrent }, (_, i) => agentManager.findAndLockAvailableAgent(
      campaign,
      'TX',
      `CA-load-${i}-${Date.now()}`,
      { agencyId },
    )),
  );
  const elapsed = Date.now() - routeStart;
  const wins = results.filter(Boolean).length;
  console.log(`Routing complete in ${elapsed}ms — locks won: ${wins}/${concurrent} (p95 target: stable under 500ms)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
