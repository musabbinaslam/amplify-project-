/* eslint-disable no-console */
/**
 * Seed mock call logs, wallet balance, and optional contests for a user.
 *
 * Usage:
 *   node tools/seedUserMockData.js --uid <firebase_uid>
 *   node tools/seedUserMockData.js --list-users
 *
 * Options:
 *   --count 25              Total call logs to create
 *   --billable 10           Minimum billable (charged) calls, dated within last 6 days
 *   --wallet-dollars 200    Add wallet credits (does not deduct for seeded calls)
 *   --contests-pending 2    Billable calls with pending contests + proof placeholders
 *   --contests-denied 1     Billable calls denied with admin note
 *   --refunded 1            Billable calls marked refunded (no wallet tx unless --with-refund-credit)
 */
require('dotenv').config();

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');
const { resolveFirestoreDatabaseId } = require('../src/config/resolveFirestoreDatabaseId');
const { CAMPAIGN_CONFIG } = require('../src/config/pricing');
const walletService = require('../src/services/walletService');

if (!admin) {
  console.error('[seed] Firebase Admin is not configured.');
  process.exit(1);
}

const args = process.argv.slice(2);

function readArg(name, fallback = null) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const listUsers = args.includes('--list-users');
const uid = readArg('uid');
const count = Math.max(1, Math.min(parseInt(readArg('count', '25'), 10) || 25, 200));
const billableMin = Math.max(0, parseInt(readArg('billable', '8'), 10) || 8);
const walletDollars = Math.max(0, parseFloat(readArg('wallet-dollars', '200')) || 0);
const contestsPending = Math.max(0, parseInt(readArg('contests-pending', '2'), 10) || 0);
const contestsDenied = Math.max(0, parseInt(readArg('contests-denied', '1'), 10) || 0);
const refundedCount = Math.max(0, parseInt(readArg('refunded', '1'), 10) || 0);

const campaignIds = Object.keys(CAMPAIGN_CONFIG || {});
const campaigns = campaignIds.length ? campaignIds : ['fe_transfers'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone() {
  const n = Math.floor(1000000000 + Math.random() * 9000000000);
  return `+1${n}`;
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function listFirestoreUsers() {
  const db = getDb();
  const snap = await db.collection('users').limit(50).get();
  if (snap.empty) {
    console.log('No users in Firestore.');
    return;
  }
  console.log('Users (up to 50):');
  snap.docs.forEach((doc) => {
    const d = doc.data() || {};
    const label = d.displayName || d.email || d.profile?.email || '(no name)';
    console.log(`  ${doc.id}  —  ${label}`);
  });
}

function buildCallLogFields(uid, campaignId, { duration, status, createdAt, callSidSuffix }) {
  const config = CAMPAIGN_CONFIG[campaignId] || { buffer: 90, price: 25, label: campaignId };
  const isBillable = status === 'completed' && duration >= (config.buffer ?? 90);
  const cost = isBillable ? Number(config.price || 0) : 0;
  return {
    callSid: `CA_SEED_${uid.slice(0, 6)}_${callSidSuffix}_${Date.now()}`,
    timestamp: createdAt.toISOString(),
    from: randomPhone(),
    to: '+18885551234',
    duration,
    campaign: campaignId,
    campaignLabel: config.label || campaignId,
    agentId: uid,
    status,
    isBillable,
    cost,
    type: campaignId.includes('transfer') ? 'Transfer' : 'Inbound',
    recordingUrl: null,
    createdAt: admin.firestore.Timestamp.fromDate(createdAt),
  };
}

async function createContest(db, uid, callLogId, logFields, status, adminNote = null) {
  const contestProofStorage = require('../src/services/contestProofStorage');
  const { FieldValue } = admin.firestore;
  const contestPayload = {
    agentId: uid,
    callLogId,
    callSid: logFields.callSid,
    campaign: logFields.campaign,
    campaignLabel: logFields.campaignLabel,
    duration: logFields.duration,
    cost: logFields.cost,
    isBillable: logFields.isBillable,
    recordingUrl: null,
    status,
    agentReason: 'Mock contest: call dropped after connect / platform glitch during testing.',
    category: 'disconnect',
    proofFiles: [],
    submittedAt: FieldValue.serverTimestamp(),
    reviewedAt: status === 'pending' ? null : FieldValue.serverTimestamp(),
    reviewedBy: status === 'pending' ? null : 'seed-script',
    adminNote: adminNote || (status === 'denied' ? 'Mock denial: insufficient evidence for this test record.' : null),
    refundAmountCents: status === 'approved' ? Math.round(logFields.cost * 100) : null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const contestRef = await db.collection('callContests').add(contestPayload);
  const mockPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const proofFiles = await contestProofStorage.saveProofsToContest(contestRef.id, [
    { originalname: 'mock-proof.png', mimetype: 'image/png', buffer: mockPng, size: mockPng.length },
  ]);
  await contestRef.set({ proofFiles, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const callLogUpdate = {
    contestId: contestRef.id,
    contestStatus: status === 'approved' ? 'approved' : status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (status === 'denied') {
    callLogUpdate.contestDenyNote = contestPayload.adminNote;
  }
  await db.collection('users').doc(uid).collection('callLogs').doc(callLogId).set(callLogUpdate, { merge: true });
  return contestRef.id;
}

async function run() {
  if (listUsers) {
    await listFirestoreUsers();
    return;
  }

  if (!uid) {
    console.error('Usage: node tools/seedUserMockData.js --uid <firebase_uid> [options]');
    console.error('       node tools/seedUserMockData.js --list-users');
    console.error('');
    console.error('Options: --count 25 --billable 10 --wallet-dollars 200');
    console.error('         --contests-pending 2 --contests-denied 1 --refunded 1');
    process.exit(1);
  }

  const db = getDb();
  if (!db) throw new Error('Firestore unavailable');
  console.log(`[seed] Firestore database: ${resolveFirestoreDatabaseId()}`);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    console.warn(`[seed] User ${uid} does not exist; creating minimal doc.`);
    await userRef.set(
      {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (walletDollars > 0) {
    const cents = Math.round(walletDollars * 100);
    const balance = await walletService.addCredits(uid, cents, 'manual', {
      idempotencyKey: `seed_wallet_${uid}_${Date.now()}`,
    });
    console.log(`[seed] Wallet credited $${walletDollars.toFixed(2)}. Balance: $${(balance / 100).toFixed(2)}`);
  }

  const specialSlots = contestsPending + contestsDenied + refundedCount;
  const regularCount = Math.max(0, count - specialSlots);
  const billableSlots = Math.max(billableMin, specialSlots);

  const createdLogs = [];

  for (let i = 0; i < billableSlots; i += 1) {
    const campaignId = randomItem(campaigns);
    const config = CAMPAIGN_CONFIG[campaignId] || { buffer: 90 };
    const duration = (config.buffer || 90) + 15 + Math.floor(Math.random() * 120);
    const createdAt = daysAgo(Math.floor(Math.random() * 5));
    const fields = buildCallLogFields(uid, campaignId, {
      duration,
      status: 'completed',
      createdAt,
      callSidSuffix: `b${i}`,
    });
    const ref = userRef.collection('callLogs').doc();
    await ref.set(fields);
    createdLogs.push({ id: ref.id, fields });
  }

  for (let i = 0; i < regularCount; i += 1) {
    const campaignId = randomItem(campaigns);
    const config = CAMPAIGN_CONFIG[campaignId] || { buffer: 90 };
    const status = Math.random() < 0.25 ? 'missed' : 'completed';
    let duration = Math.floor(Math.random() * 400);
    if (status === 'completed' && Math.random() < 0.3) {
      duration = (config.buffer || 90) + 10;
    }
    const createdAt = daysAgo(Math.floor(Math.random() * 40));
    const fields = buildCallLogFields(uid, campaignId, {
      duration,
      status,
      createdAt,
      callSidSuffix: `r${i}`,
    });
    const ref = userRef.collection('callLogs').doc();
    await ref.set(fields);
    createdLogs.push({ id: ref.id, fields });
  }

  const billableLogs = createdLogs.filter((l) => l.fields.isBillable && l.fields.cost > 0);
  let cursor = 0;

  for (let i = 0; i < contestsPending && cursor < billableLogs.length; i += 1, cursor += 1) {
    const row = billableLogs[cursor];
    await createContest(db, uid, row.id, row.fields, 'pending');
    console.log(`[seed] Pending contest on call ${row.id}`);
  }

  for (let i = 0; i < contestsDenied && cursor < billableLogs.length; i += 1, cursor += 1) {
    const row = billableLogs[cursor];
    await createContest(db, uid, row.id, row.fields, 'denied');
    console.log(`[seed] Denied contest on call ${row.id}`);
  }

  for (let i = 0; i < refundedCount && cursor < billableLogs.length; i += 1, cursor += 1) {
    const row = billableLogs[cursor];
    const amountCents = Math.round(row.fields.cost * 100);
    await userRef.collection('callLogs').doc(row.id).set(
      {
        refunded: true,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedBy: 'seed-script',
        refundReason: 'Mock refund for UI testing',
        refundAmountCents: amountCents,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`[seed] Refunded call ${row.id} (display only — use admin approve for live wallet credit)`);
  }

  console.log('');
  console.log(`[seed] Done for ${uid}.`);
  console.log(`  Call logs: ${createdLogs.length} (${billableLogs.length} billable)`);
  console.log(`  Pending contests: ${Math.min(contestsPending, billableLogs.length)}`);
  console.log(`  Denied contests: ${Math.min(contestsDenied, Math.max(0, billableLogs.length - contestsPending))}`);
  console.log('  Open Call Logs + Admin → Call charge contests to verify.');
}

run().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
