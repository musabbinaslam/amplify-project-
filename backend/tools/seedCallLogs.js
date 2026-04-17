/* eslint-disable no-console */
require('dotenv').config();

const admin = require('../src/config/firebaseAdmin');
const { CAMPAIGN_CONFIG } = require('../src/config/pricing');

if (!admin) {
  console.error('[seedCallLogs] Firebase Admin is not configured.');
  console.error('Set FIREBASE_SERVICE_ACCOUNT_JSON or add backend/firebase-service-account.json.');
  process.exit(1);
}

const args = process.argv.slice(2);

function readArg(name, fallback = null) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const uid = readArg('uid');
const count = Math.max(1, Math.min(parseInt(readArg('count', '25'), 10) || 25, 500));

if (!uid) {
  console.error('Usage: node tools/seedCallLogs.js --uid <firebase_uid> [--count 25]');
  process.exit(1);
}

const campaignIds = Object.keys(CAMPAIGN_CONFIG || {});
const fallbackCampaigns = ['aca', 'final_expense', 'medicare'];
const campaigns = campaignIds.length ? campaignIds : fallbackCampaigns;

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone() {
  const n = Math.floor(1000000000 + Math.random() * 9000000000);
  return `+1${n}`;
}

function randomDuration(maxSeconds = 900) {
  return Math.floor(Math.random() * maxSeconds);
}

function randomPastDate(daysBack = 30) {
  const now = Date.now();
  const delta = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return new Date(now - delta);
}

async function run() {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    console.warn(`[seedCallLogs] User ${uid} does not exist yet; creating minimal doc.`);
    await userRef.set(
      {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const batch = db.batch();
  let billableCount = 0;
  let totalCost = 0;

  for (let i = 0; i < count; i += 1) {
    const campaignId = randomItem(campaigns);
    const config = CAMPAIGN_CONFIG[campaignId] || {};
    const duration = randomDuration(1200);
    const status = Math.random() < 0.2 ? 'missed' : 'completed';
    const isBillable = status === 'completed' && duration >= (config.buffer ?? 90);
    const cost = isBillable ? Number(config.price || 0) : 0;

    if (isBillable) {
      billableCount += 1;
      totalCost += cost;
    }

    const ts = randomPastDate(45);
    const callDoc = userRef.collection('callLogs').doc();
    batch.set(callDoc, {
      callSid: `CA_TEST_${uid.slice(0, 6)}_${i}_${Date.now()}`,
      timestamp: ts.toISOString(),
      from: randomPhone(),
      to: '+18885551234',
      duration,
      campaign: campaignId,
      campaignLabel: config.label || campaignId,
      agentId: uid,
      status,
      isBillable,
      cost,
      type: 'Inbound',
      recordingUrl: null,
      createdAt: admin.firestore.Timestamp.fromDate(ts),
    });
  }

  await batch.commit();

  console.log(`[seedCallLogs] Added ${count} call logs for user ${uid}.`);
  console.log(`[seedCallLogs] Billable calls: ${billableCount}, total simulated revenue: $${totalCost.toFixed(2)}.`);
  console.log('[seedCallLogs] Open /app/call-logs and refresh.');
}

run().catch((err) => {
  console.error('[seedCallLogs] Failed:', err.message);
  process.exit(1);
});
