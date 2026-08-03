#!/usr/bin/env node
/**
 * Backfill policiesClosed counters into adminMetrics/daily/days/{day} for all
 * existing call logs that already have disposition === 'policy_closed'.
 *
 * Safe to re-run: the script RESETS (overwrites) the policiesClosed field on
 * each affected day doc rather than incrementing, so running it multiple times
 * produces the same result.
 *
 * Usage:
 *   node backend/scripts/backfill_policies_closed.js
 *   node backend/scripts/backfill_policies_closed.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Parse a Firestore Timestamp or ISO string into a YYYY-MM-DD string.
 * Returns null if unparseable.
 */
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

  console.log(`\n🔍 Backfill policiesClosed ${DRY_RUN ? '(DRY RUN)' : ''} starting...\n`);

  const db = getDb();

  // ── Step 1: Scan every agent's callLogs for policy_closed dispositions ──────
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.docs.length} user documents.`);

  // Accumulator: Map<day, Map<agentId, count>>
  // e.g. { '2026-07-01': { 'agentUID1': 3, 'agentUID2': 1 } }
  const byDay = new Map();

  let totalLogs = 0;
  let policiesFound = 0;

  for (const userDoc of usersSnap.docs) {
    const agentId = userDoc.id;
    const data = userDoc.data() || {};

    // Skip agency-member users — same filter as the leaderboard service
    if (data.agencyId) continue;
    const role = data.role || 'agent';
    if (role !== 'agent') continue;

    const logsSnap = await userDoc.ref.collection('callLogs').get();
    totalLogs += logsSnap.docs.length;

    for (const logDoc of logsSnap.docs) {
      const log = logDoc.data() || {};
      if (log.disposition !== 'policy_closed') continue;

      const day = toDateKey(log.createdAt || log.timestamp);
      if (!day) {
        console.warn(`  ⚠️  Skipping log ${logDoc.id} for agent ${agentId} — no parseable date`);
        continue;
      }

      if (!byDay.has(day)) byDay.set(day, new Map());
      const dayMap = byDay.get(day);
      dayMap.set(agentId, (dayMap.get(agentId) || 0) + 1);
      policiesFound += 1;
    }
  }

  console.log(`\n✅ Scanned ${totalLogs} call logs across ${usersSnap.docs.length} users.`);
  console.log(`📋 Found ${policiesFound} policy_closed dispositions across ${byDay.size} day(s).\n`);

  if (policiesFound === 0) {
    console.log('Nothing to backfill. Exiting.');
    process.exit(0);
  }

  // ── Step 2: Write the per-day, per-agent tallies into adminMetrics ───────────
  const daysRef = db.collection('adminMetrics').doc('daily').collection('days');

  let daysWritten = 0;

  for (const [day, agentMap] of byDay) {
    // Build agents sub-object and summary total for this day
    const agentsPayload = {};
    let dayTotal = 0;

    for (const [agentId, count] of agentMap) {
      agentsPayload[agentId] = { policiesClosed: count };
      dayTotal += count;
      console.log(`  📅 ${day} | agent ${agentId} → ${count} polic${count === 1 ? 'y' : 'ies'} closed`);
    }

    const payload = {
      summary: { policiesClosed: dayTotal },
      agents: agentsPayload,
    };

    if (!DRY_RUN) {
      // merge: true ensures we don't wipe out other fields (calls, billableCalls, etc.)
      await daysRef.doc(day).set(payload, { merge: true });
    }

    daysWritten += 1;
  }

  console.log(`\n${DRY_RUN ? '🟡 DRY RUN — no writes made.' : `✅ Wrote policiesClosed counts to ${daysWritten} day document(s) in adminMetrics.`}`);
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
