#!/usr/bin/env node
/**
 * Repair script: the previous backfill_policies_closed.js used set() with merge:true
 * on nested maps, which OVERWROTE the entire "agents" field in each affected day doc
 * — wiping calls/billableCalls/etc. for those agents on those days.
 *
 * This script fully REBUILDS the affected day documents by re-scanning all call logs
 * for each affected day, recomputing every metric (calls, billableCalls, totalDuration,
 * totalCost, policiesClosed) from the source-of-truth call logs, then writing the
 * complete, correct payload back using dot-notation paths so nothing is clobbered.
 *
 * Usage:
 *   node backend/scripts/repair_policies_closed.js
 *   node backend/scripts/repair_policies_closed.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');

const DRY_RUN = process.argv.includes('--dry-run');

function toDateKey(createdAt) {
  if (!createdAt) return null;
  try {
    const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

async function main() {
  if (!admin) {
    console.error('Firebase Admin unavailable — check credentials.');
    process.exit(1);
  }

  console.log(`\n🔧 Repair + backfill policiesClosed ${DRY_RUN ? '(DRY RUN)' : ''} starting...\n`);

  const db = getDb();

  // ── Step 1: Scan ALL call logs and bucket by day ─────────────────────────────
  // We rebuild from scratch for any day that contains a policy_closed disposition.
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.docs.length} user documents.\n`);

  // dayBuckets: Map<day, Map<agentId, { calls, billableCalls, answeredCalls, totalDuration, totalCost, policiesClosed }>>
  const dayBuckets = new Map();
  // Track which days have policy_closed so we know what to rebuild
  const affectedDays = new Set([
    '2026-06-27', '2026-07-05', '2026-07-07', '2026-07-01',
    '2026-06-16', '2026-07-03', '2026-06-14', '2026-06-25',
    '2026-06-22', '2026-07-06', '2026-06-11', '2026-06-30',
  ]);

  let totalLogs = 0;

  for (const userDoc of usersSnap.docs) {
    const agentId = userDoc.id;
    const logsSnap = await userDoc.ref.collection('callLogs').get();
    totalLogs += logsSnap.docs.length;

    for (const logDoc of logsSnap.docs) {
      const log = logDoc.data() || {};
      const day = toDateKey(log.createdAt || log.timestamp);
      if (!day || !affectedDays.has(day)) continue;

      if (!dayBuckets.has(day)) dayBuckets.set(day, new Map());
      const agentMap = dayBuckets.get(day);

      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          calls: 0, billableCalls: 0, answeredCalls: 0,
          totalDuration: 0, totalCost: 0, policiesClosed: 0,
        });
      }

      const bucket = agentMap.get(agentId);
      bucket.calls += 1;
      if (log.status === 'completed') bucket.answeredCalls += 1;
      if (log.isBillable) bucket.billableCalls += 1;
      bucket.totalDuration += Number(log.duration || 0);
      bucket.totalCost += Number(log.cost || 0);
      if (log.disposition === 'policy_closed') bucket.policiesClosed += 1;
    }
  }

  console.log(`✅ Scanned ${totalLogs} total call logs.`);
  console.log(`📅 Rebuilding ${dayBuckets.size} affected day(s)...\n`);

  const daysRef = db.collection('adminMetrics').doc('daily').collection('days');

  // ── Step 2: Rebuild each affected day doc ─────────────────────────────────────
  for (const [day, agentMap] of dayBuckets) {
    // Recompute summary totals from the agent buckets
    let summaryTotalCalls = 0, summaryAnsweredCalls = 0, summaryBillableCalls = 0;
    let summaryTotalDuration = 0, summaryTotalCost = 0, summaryPoliciesClosed = 0;

    // Build the agents sub-map
    const agentsPayload = {};
    for (const [agentId, b] of agentMap) {
      agentsPayload[agentId] = {
        calls: b.calls,
        answeredCalls: b.answeredCalls,
        billableCalls: b.billableCalls,
        totalDuration: b.totalDuration,
        totalCost: b.totalCost,
        policiesClosed: b.policiesClosed,
      };
      summaryTotalCalls    += b.calls;
      summaryAnsweredCalls  += b.answeredCalls;
      summaryBillableCalls  += b.billableCalls;
      summaryTotalDuration  += b.totalDuration;
      summaryTotalCost      += b.totalCost;
      summaryPoliciesClosed += b.policiesClosed;

      console.log(
        `  📅 ${day} | agent ${agentId}` +
        ` | calls=${b.calls} billable=${b.billableCalls}` +
        ` | policies=${b.policiesClosed}`
      );
    }

    console.log(
      `  ↳ day total: calls=${summaryTotalCalls} billable=${summaryBillableCalls}` +
      ` policies=${summaryPoliciesClosed}\n`
    );

    if (!DRY_RUN) {
      // Use update() with a FLAT, dot-notation payload so we only touch the
      // specific fields we computed — nothing else in the doc is disturbed.
      const updatePayload = {
        [`summary.totalCalls`]: summaryTotalCalls,
        [`summary.answeredCalls`]: summaryAnsweredCalls,
        [`summary.billableCalls`]: summaryBillableCalls,
        [`summary.totalDuration`]: summaryTotalDuration,
        [`summary.totalCost`]: summaryTotalCost,
        [`summary.policiesClosed`]: summaryPoliciesClosed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Write each agent's fields individually using dot notation
      for (const [agentId, b] of agentMap) {
        updatePayload[`agents.${agentId}.calls`]          = b.calls;
        updatePayload[`agents.${agentId}.answeredCalls`]  = b.answeredCalls;
        updatePayload[`agents.${agentId}.billableCalls`]  = b.billableCalls;
        updatePayload[`agents.${agentId}.totalDuration`]  = b.totalDuration;
        updatePayload[`agents.${agentId}.totalCost`]      = b.totalCost;
        updatePayload[`agents.${agentId}.policiesClosed`] = b.policiesClosed;
      }

      await daysRef.doc(day).set(
        // Use set+merge so the doc is created if it doesn't exist, but we still
        // pass the flat payload which Firestore respects as field-level paths
        // by wrapping in a set call that won't wipe unmentioned fields.
        // Actually we need update() to use dot notation — but update() fails if
        // doc doesn't exist. Use set() to create if missing, then update() to patch.
        { day },
        { merge: true }
      );
      await daysRef.doc(day).update(updatePayload);
    }
  }

  console.log(DRY_RUN
    ? '🟡 DRY RUN — no writes made.'
    : `✅ Rebuilt ${dayBuckets.size} day document(s) in adminMetrics with correct data.`
  );
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
