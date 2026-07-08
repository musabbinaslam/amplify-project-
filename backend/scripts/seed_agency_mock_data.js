#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed mock agencies, members, locked campaigns, DIDs, and call logs for local/staging testing.
 *
 * Usage:
 *   node scripts/seed_agency_mock_data.js --dry-run
 *   node scripts/seed_agency_mock_data.js
 *   node scripts/seed_agency_mock_data.js --reset
 *   node scripts/seed_agency_mock_data.js --list-users
 *
 * Options:
 *   --admin-uid <uid>       Force agency admin (Alpha agency) — defaults to first platform agent
 *   --agents-per-agency 4   Agents per agency (excluding admin)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');
const { CAMPAIGN_CONFIG } = require('../src/config/pricing');
const walletService = require('../src/services/walletService');

const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');
const LIST_USERS = process.argv.includes('--list-users');

const args = process.argv.slice(2);
function readArg(name, fallback) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const FORCED_ADMIN_UID = readArg('admin-uid', null);
const AGENTS_PER_AGENCY = Math.max(1, Math.min(parseInt(readArg('agents-per-agency', '3'), 10) || 3, 10));
const CALL_LOGS_PER_AGENT = Math.max(5, Math.min(parseInt(readArg('logs-per-agent', '12'), 10) || 12, 50));
const WALLET_DOLLARS = Math.max(0, parseFloat(readArg('wallet-dollars', '500')) || 500);

/** Fixed IDs so re-running updates instead of duplicating. */
const MOCK_AGENCIES = [
  {
    id: 'mock-acme-agency',
    name: 'Acme Call Center (Mock)',
    slug: 'acme-call-center-mock',
    lockedCampaignIds: ['fe_tv_calls', 'medicare_transfers'],
    dids: [
      { phoneE164: '+15559001001', campaignId: 'fe_tv_calls', label: 'Acme FE TV line' },
      { phoneE164: '+15559001002', campaignId: 'medicare_transfers', label: 'Acme Medicare line' },
    ],
  },
  {
    id: 'mock-summit-agency',
    name: 'Summit Partners (Mock)',
    slug: 'summit-partners-mock',
    lockedCampaignIds: ['aca_transfers', 'medicare_inbound_1'],
    dids: [
      { phoneE164: '+15559002001', campaignId: 'aca_transfers', label: 'Summit ACA line' },
      { phoneE164: '+15559002002', campaignId: 'medicare_inbound_1', label: 'Summit Medicare line' },
    ],
  },
];

function randomPhone() {
  const n = Math.floor(1000000000 + Math.random() * 9000000000);
  return `+1${n}`;
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

function buildCallLog(agentId, agencyId, campaignId, idx) {
  const config = CAMPAIGN_CONFIG[campaignId] || { buffer: 90, price: 25, label: campaignId };
  const status = Math.random() < 0.2 ? 'missed' : 'completed';
  let duration = Math.floor(Math.random() * 300);
  if (status === 'completed' && Math.random() < 0.65) {
    duration = (config.buffer || 90) + 20 + Math.floor(Math.random() * 180);
  }
  const isBillable = status === 'completed' && duration >= (config.buffer ?? 90);
  const createdAt = daysAgo(Math.floor(Math.random() * 14));
  const recordingSid = isBillable && Math.random() < 0.7
    ? `RE${'a'.repeat(32).replace(/a/g, () => '0123456789abcdef'[Math.floor(Math.random() * 16)])}`
    : null;

  return {
    callSid: `CA_MOCK_${agencyId.slice(0, 6)}_${agentId.slice(0, 6)}_${idx}_${Date.now()}`,
    timestamp: createdAt.toISOString(),
    from: randomPhone(),
    to: '+18885551234',
    duration,
    campaign: campaignId,
    campaignLabel: config.label || campaignId,
    agentId,
    agencyId,
    status,
    isBillable,
    cost: isBillable ? Number(config.price || 0) : 0,
    type: campaignId.includes('transfer') ? 'Transfer' : 'Inbound',
    recordingUrl: recordingSid ? `https://api.twilio.com/2010-04-01/Accounts/mock/Recordings/${recordingSid}` : null,
    recordingSid,
    createdAt: admin.firestore.Timestamp.fromDate(createdAt),
  };
}

async function listUsers() {
  const db = getDb();
  const snap = await db.collection('users').limit(100).get();
  console.log('Firestore users:');
  snap.docs.forEach((doc) => {
    const d = doc.data() || {};
    const label = d.displayName || d.fullName || d.email || '(no name)';
    console.log(`  ${doc.id}  role=${d.role || 'agent'}  agencyId=${d.agencyId ?? 'null'}  —  ${label}`);
  });
}

async function getPlatformUsers() {
  const db = getDb();
  const snap = await db.collection('users').get();
  return snap.docs
    .map((doc) => ({ uid: doc.id, ...doc.data() }))
    .filter((u) => {
      if (u.agencyId) return false;
      const role = u.role || 'agent';
      if (role === 'admin' || role === 'qa') return false;
      return true;
    });
}

async function lockCampaignsForAgency(agencyId, lockedCampaignIds) {
  const db = getDb();
  const { FieldValue } = admin.firestore;
  const pricingRef = db.collection('system').doc('pricing');
  const pricingSnap = await pricingRef.get();
  const campaigns = { ...(pricingSnap.data()?.campaigns || {}) };

  Object.keys(campaigns).forEach((campaignId) => {
    const meta = campaigns[campaignId];
    if (!meta || typeof meta !== 'object') return;
    if (String(meta.agencyId) === agencyId) {
      campaigns[campaignId] = { ...meta, locked: false, agencyId: null };
    }
  });

  lockedCampaignIds.forEach((campaignId) => {
    const base = campaigns[campaignId] || CAMPAIGN_CONFIG[campaignId] || {};
    campaigns[campaignId] = {
      label: base.label || campaignId,
      buffer: Number(base.buffer) || 0,
      price: Number(base.price) || 0,
      locked: true,
      agencyId,
    };
  });

  if (!DRY_RUN) {
    await pricingRef.set({ campaigns, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

async function upsertPhoneRoute({ phoneE164, campaignId, label, agencyId }) {
  const db = getDb();
  const { FieldValue } = admin.firestore;
  const snap = await db.collection('phoneRoutes').where('phoneE164', '==', phoneE164).limit(1).get();
  const payload = {
    phoneE164,
    campaignId,
    label,
    agencyId,
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (DRY_RUN) return { phoneE164, campaignId, agencyId };
  if (!snap.empty) {
    await snap.docs[0].ref.set(payload, { merge: true });
    return { id: snap.docs[0].id, ...payload };
  }
  const ref = await db.collection('phoneRoutes').add({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, ...payload };
}

async function assignUser(uid, { agencyId, role }) {
  const db = getDb();
  const { FieldValue } = admin.firestore;
  const patch = {
    agencyId,
    role,
    managedAgents: [],
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!DRY_RUN) {
    await db.collection('users').doc(uid).set(patch, { merge: true });
  }
  return { uid, ...patch };
}

async function seedCallLogsForAgent(agentId, agencyId, campaignIds) {
  const db = getDb();
  let created = 0;
  for (let i = 0; i < CALL_LOGS_PER_AGENT; i += 1) {
    const campaignId = campaignIds[i % campaignIds.length];
    const log = buildCallLog(agentId, agencyId, campaignId, i);
    if (!DRY_RUN) {
      await db.collection('users').doc(agentId).collection('callLogs').add(log);
    }
    created += 1;
  }
  return created;
}

async function creditWallet(uid) {
  if (WALLET_DOLLARS <= 0 || DRY_RUN) return null;
  const cents = Math.round(WALLET_DOLLARS * 100);
  return walletService.addCredits(uid, cents, 'manual', {
    idempotencyKey: `seed_agency_wallet_${uid}`,
  });
}

async function resetMockData() {
  const db = getDb();
  console.log('Resetting mock agency data...');

  for (const agency of MOCK_AGENCIES) {
    const membersSnap = await db.collection('users').where('agencyId', '==', agency.id).get();
    if (!DRY_RUN) {
      const batch = db.batch();
      membersSnap.docs.forEach((doc) => {
        batch.set(doc.ref, {
          agencyId: null,
          role: 'agent',
          managedAgents: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      if (membersSnap.size) await batch.commit();
    }
    console.log(`  Unassigned ${membersSnap.size} member(s) from ${agency.id}`);

    for (const did of agency.dids) {
      const snap = await db.collection('phoneRoutes').where('phoneE164', '==', did.phoneE164).limit(1).get();
      if (!snap.empty && !DRY_RUN) {
        await snap.docs[0].ref.delete();
        console.log(`  Deleted DID ${did.phoneE164}`);
      }
    }

    if (!DRY_RUN) {
      await db.collection('agencies').doc(agency.id).delete();
    }
    console.log(`  Removed agency ${agency.id}`);
  }

  if (!DRY_RUN) {
    const pricingRef = db.collection('system').doc('pricing');
    const pricingSnap = await pricingRef.get();
    const campaigns = { ...(pricingSnap.data()?.campaigns || {}) };
    MOCK_AGENCIES.forEach((agency) => {
      agency.lockedCampaignIds.forEach((campaignId) => {
        if (campaigns[campaignId]) {
          campaigns[campaignId] = {
            ...campaigns[campaignId],
            locked: false,
            agencyId: null,
          };
        }
      });
    });
    await pricingRef.set({ campaigns, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  console.log('Reset complete.');
}

async function run() {
  if (!admin) {
    console.error('Firebase Admin unavailable.');
    process.exit(1);
  }

  if (LIST_USERS) {
    await listUsers();
    return;
  }

  if (RESET) {
    await resetMockData();
    return;
  }

  const db = getDb();
  const platformUsers = await getPlatformUsers();
  const needed = MOCK_AGENCIES.length * (1 + AGENTS_PER_AGENCY);
  if (platformUsers.length < MOCK_AGENCIES.length * 2) {
    console.warn(`Warning: only ${platformUsers.length} platform user(s) available; need at least ${MOCK_AGENCIES.length * 2}.`);
  }

  console.log(`Agency mock seed ${DRY_RUN ? '(DRY RUN)' : ''} starting...`);
  console.log(`  Agencies: ${MOCK_AGENCIES.length}, agents/agency: ${AGENTS_PER_AGENCY}, logs/agent: ${CALL_LOGS_PER_AGENT}`);

  let userCursor = 0;
  const summary = [];

  for (let aIdx = 0; aIdx < MOCK_AGENCIES.length; aIdx += 1) {
    const spec = MOCK_AGENCIES[aIdx];
    const { FieldValue } = admin.firestore;

    if (!DRY_RUN) {
      await db.collection('agencies').doc(spec.id).set({
        name: spec.name,
        slug: spec.slug,
        status: 'active',
        lockedCampaignIds: spec.lockedCampaignIds,
        settings: { maxAgents: 300, mock: true },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    console.log(`\n[${spec.name}] agencyId=${spec.id}`);

    await lockCampaignsForAgency(spec.id, spec.lockedCampaignIds);
    console.log(`  Locked campaigns: ${spec.lockedCampaignIds.join(', ')}`);

    for (const did of spec.dids) {
      await upsertPhoneRoute({ ...did, agencyId: spec.id });
      console.log(`  DID ${did.phoneE164} → ${did.campaignId}`);
    }

    let adminUid = aIdx === 0 && FORCED_ADMIN_UID ? FORCED_ADMIN_UID : null;
    if (!adminUid && userCursor < platformUsers.length) {
      adminUid = platformUsers[userCursor].uid;
      userCursor += 1;
    }
    const agentUids = [];
    for (let i = 0; i < AGENTS_PER_AGENCY && userCursor < platformUsers.length; i += 1) {
      agentUids.push(platformUsers[userCursor].uid);
      userCursor += 1;
    }

    if (adminUid) {
      await assignUser(adminUid, { agencyId: spec.id, role: 'agency_admin' });
      console.log(`  Agency admin: ${adminUid}`);
      summary.push({ agency: spec.name, agencyId: spec.id, role: 'agency_admin', uid: adminUid });
    } else {
      console.warn('  No user available for agency admin — assign manually in Admin → Agencies');
    }

    for (const agentUid of agentUids) {
      await assignUser(agentUid, { agencyId: spec.id, role: 'agency_agent' });
      const logs = await seedCallLogsForAgent(agentUid, spec.id, spec.lockedCampaignIds);
      if (!DRY_RUN) await creditWallet(agentUid);
      console.log(`  Agent: ${agentUid} (${logs} call logs${WALLET_DOLLARS ? `, $${WALLET_DOLLARS} wallet` : ''})`);
      summary.push({ agency: spec.name, agencyId: spec.id, role: 'agency_agent', uid: agentUid });
    }
  }

  console.log('\n── Test flow ──');
  console.log('1. Platform admin → /app/admin/agencies — verify Acme + Summit agencies');
  console.log('2. Log in as agency admin → sidebar "Agency Dashboard" (/app/agency)');
  console.log('3. Log in as agency agent → Take Calls — only locked agency campaigns visible');
  console.log('4. Platform admin → Live Ops — should NOT show agency agents (platform only)');
  console.log('\n── Seeded accounts ──');
  summary.forEach((row) => {
    console.log(`  [${row.agency}] ${row.role}: ${row.uid}`);
  });
  console.log('\nDone.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
