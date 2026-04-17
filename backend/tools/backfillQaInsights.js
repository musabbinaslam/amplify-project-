#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();

const admin = require('../src/config/firebaseAdmin');
const { generateQaInsight } = require('../src/services/qaInsightService');

function parseArgs(argv) {
  const out = {
    uid: '',
    limit: 0,
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--uid') {
      out.uid = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg.startsWith('--uid=')) {
      out.uid = arg.split('=').slice(1).join('=').trim();
    } else if (arg === '--limit') {
      out.limit = Number(argv[i + 1] || 0);
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      out.limit = Number(arg.split('=').slice(1).join('='));
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--force') {
      out.force = true;
    }
  }
  if (!Number.isFinite(out.limit) || out.limit < 0) out.limit = 0;
  return out;
}

function toIsoTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value && typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!admin) {
    throw new Error('Firebase Admin is not configured. Check backend/.env or firebase-service-account.json');
  }
  if (!args.uid) {
    throw new Error('Missing required --uid <firebase_uid>');
  }

  const db = admin.firestore();
  const callLogsRef = db.collection('users').doc(args.uid).collection('callLogs');
  const snapshot = await callLogsRef.orderBy('createdAt', 'desc').limit(args.limit > 0 ? args.limit : 5000).get();

  if (snapshot.empty) {
    console.log(`[backfillQaInsights] No call logs found for uid=${args.uid}`);
    return;
  }

  let total = 0;
  let withInsight = 0;
  let missingInsight = 0;
  let updated = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    total += 1;
    const data = doc.data() || {};
    const hasQaScore = data?.qaInsight?.score != null;
    if (hasQaScore && !args.force) {
      withInsight += 1;
      continue;
    }
    missingInsight += 1;

    const callMeta = {
      callSid: data.callSid || doc.id,
      status: data.status || 'unknown',
      duration: Number(data.duration || 0),
      campaign: data.campaign || 'unknown',
      campaignLabel: data.campaignLabel || data.campaign || 'unknown',
      isBillable: Boolean(data.isBillable),
      cost: Number(data.cost || 0),
      state: data?.qaInsight?.signals?.state || null,
      from: data.from || null,
      to: data.to || null,
      createdAt: toIsoTimestamp(data.createdAt) || toIsoTimestamp(data.timestamp),
    };

    try {
      const qaInsight = await generateQaInsight(callMeta);
      if (args.dryRun) {
        console.log(`[dry-run] Would update ${doc.id} score=${qaInsight.score} source=${qaInsight.source}`);
        updated += 1;
      } else {
        await doc.ref.set(
          {
            qaInsight: {
              ...qaInsight,
              generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        updated += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(`[backfillQaInsights] Failed doc=${doc.id}: ${err.message}`);
    }
  }

  console.log('\n[backfillQaInsights] Done');
  console.log(`uid: ${args.uid}`);
  console.log(`totalScanned: ${total}`);
  console.log(`alreadyHadQaInsight: ${withInsight}`);
  console.log(`missingOrForced: ${missingInsight}`);
  console.log(`updated: ${updated}`);
  console.log(`failed: ${failed}`);
  console.log(`mode: ${args.dryRun ? 'dry-run' : 'write'}`);
}

main().catch((err) => {
  console.error(`[backfillQaInsights] Error: ${err.message}`);
  process.exit(1);
});
