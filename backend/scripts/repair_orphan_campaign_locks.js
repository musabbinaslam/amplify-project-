#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Unlock campaigns and clear phone routes tied to agencies that no longer exist.
 *
 * Usage:
 *   node scripts/repair_orphan_campaign_locks.js --dry-run
 *   node scripts/repair_orphan_campaign_locks.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');
const agencyCampaignService = require('../src/services/agencyCampaignService');
const { normalizeAgencyId } = require('../src/utils/tenancy');

const DRY_RUN = process.argv.includes('--dry-run');

async function listKnownAgencyIds(db) {
  const snap = await db.collection('agencies').get();
  return new Set(snap.docs.map((doc) => doc.id));
}

async function findOrphanCampaignAgencyIds(db, knownAgencyIds) {
  const pricingSnap = await db.collection('system').doc('pricing').get();
  const campaigns = pricingSnap.data()?.campaigns || {};
  const orphanAgencyIds = new Set();

  Object.values(campaigns).forEach((meta) => {
    if (!meta || typeof meta !== 'object') return;
    const agencyId = normalizeAgencyId(meta.agencyId);
    if (!agencyId) return;
    if (!knownAgencyIds.has(agencyId)) orphanAgencyIds.add(agencyId);
  });

  const routeSnap = await db.collection('phoneRoutes').get();
  routeSnap.docs.forEach((doc) => {
    const agencyId = normalizeAgencyId(doc.data()?.agencyId);
    if (!agencyId) return;
    if (!knownAgencyIds.has(agencyId)) orphanAgencyIds.add(agencyId);
  });

  return [...orphanAgencyIds];
}

async function run() {
  if (!admin) {
    console.error('Firebase Admin unavailable.');
    process.exit(1);
  }
  const db = getDb();
  if (!db) {
    console.error('Firestore unavailable.');
    process.exit(1);
  }

  const knownAgencyIds = await listKnownAgencyIds(db);
  const orphanAgencyIds = await findOrphanCampaignAgencyIds(db, knownAgencyIds);

  if (!orphanAgencyIds.length) {
    console.log('No orphan agency locks found.');
    return;
  }

  console.log(`Found ${orphanAgencyIds.length} deleted agency id(s) with stale locks.`);

  let totalCampaigns = 0;
  let totalRoutes = 0;

  for (const agencyId of orphanAgencyIds) {
    console.log(`\nRepairing stale resources for deleted agency: ${agencyId}`);
    if (DRY_RUN) {
      const pricingSnap = await db.collection('system').doc('pricing').get();
      const campaigns = pricingSnap.data()?.campaigns || {};
      const campaignIds = Object.keys(campaigns).filter(
        (id) => normalizeAgencyId(campaigns[id]?.agencyId) === agencyId,
      );
      const routeSnap = await db.collection('phoneRoutes').where('agencyId', '==', agencyId).get();
      console.log(`  [dry-run] would unlock campaigns: ${campaignIds.join(', ') || '(none)'}`);
      console.log(`  [dry-run] would clear agencyId on ${routeSnap.size} phone route(s)`);
      totalCampaigns += campaignIds.length;
      totalRoutes += routeSnap.size;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const released = await agencyCampaignService.releaseAgencyResources(agencyId, {
      lockedCampaignIds: [],
    });
    totalCampaigns += released.unlockedCampaignIds.length;
    totalRoutes += released.updatedRouteIds.length;
    console.log(`  unlocked campaigns: ${released.unlockedCampaignIds.join(', ') || '(none)'}`);
    console.log(`  updated routes: ${released.updatedRouteIds.length}`);
  }

  console.log(
    `\nDone. orphanAgencies=${orphanAgencyIds.length} campaignsUnlocked=${totalCampaigns} routesUpdated=${totalRoutes}${DRY_RUN ? ' (dry-run)' : ''}`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
