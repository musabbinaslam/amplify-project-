#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();

const callLogService = require('../src/services/callLogService');
const { runQaAudioReviewJob } = require('../src/queues/qaQueue');
const qaComplianceRuleService = require('../src/services/qaComplianceRuleService');

function parseArgs(argv) {
  const out = {
    uid: '',
    limit: 25,
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
  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 25;
  out.limit = Math.min(out.limit, 100);
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim());
  if (!geminiConfigured) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const activeRules = await qaComplianceRuleService.listRules({ activeOnly: true });
  if (!activeRules.length) {
    throw new Error('Add an active compliance rule before analyzing recordings');
  }

  const scan = await callLogService.collectQaAudioBackfillCandidates({
    limit: args.limit,
    force: args.force,
    uid: args.uid,
  });

  console.log('[backfillQaAudioReviews] Scan complete');
  console.log(`scannedUsers: ${scan.scannedUsers}`);
  console.log(`scannedLogs: ${scan.scannedLogs}`);
  console.log(`queued: ${scan.candidates.length}`);
  console.log(`skippedNoRecording: ${scan.skippedNoRecording}`);
  console.log(`skippedAlreadyAnalyzed: ${scan.skippedAlreadyAnalyzed}`);
  console.log(`skippedInFlight: ${scan.skippedInFlight}`);
  console.log(`mode: ${args.dryRun ? 'dry-run' : 'write'}`);

  if (!scan.candidates.length) {
    console.log('No older recordings left to analyze.');
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const savedLog of scan.candidates) {
    if (args.dryRun) {
      console.log(`[dry-run] Would analyze ${savedLog.agentId}/${savedLog.id} sid=${savedLog.recordingSid}`);
      updated += 1;
      continue;
    }
    try {
      await runQaAudioReviewJob({
        savedLog,
        agentId: savedLog.agentId,
        force: args.force,
      });
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`[backfillQaAudioReviews] Failed ${savedLog.agentId}/${savedLog.id}: ${err.message}`);
    }
  }

  console.log('\n[backfillQaAudioReviews] Done');
  console.log(`updated: ${updated}`);
  console.log(`failed: ${failed}`);
}

main().catch((err) => {
  console.error(`[backfillQaAudioReviews] Error: ${err.message}`);
  process.exit(1);
});
