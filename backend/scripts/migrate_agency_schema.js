#!/usr/bin/env node
/**
 * Backfill agencyId: null on users, phoneRoutes, and callLogs.
 * Run once before enabling multi-agency features:
 *   node backend/scripts/migrate_agency_schema.js
 *   node backend/scripts/migrate_agency_schema.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 400;

async function backfillCollectionField(collectionName, field, defaultValue) {
  const db = getDb();
  const snap = await db.collection(collectionName).get();
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    let batchOps = 0;

    chunk.forEach((doc) => {
      const data = doc.data() || {};
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        skipped += 1;
        return;
      }
      if (!DRY_RUN) {
        batch.set(doc.ref, { [field]: defaultValue }, { merge: true });
        batchOps += 1;
      }
      updated += 1;
    });

    if (batchOps > 0) await batch.commit();
  }

  console.log(`[${collectionName}] ${DRY_RUN ? 'would update' : 'updated'} ${updated}, skipped ${skipped}`);
}

async function backfillUserCallLogs() {
  const db = getDb();
  const usersSnap = await db.collection('users').get();
  let updatedLogs = 0;

  for (const userDoc of usersSnap.docs) {
    const logsSnap = await userDoc.ref.collection('callLogs').get();
    if (logsSnap.empty) continue;

    for (let i = 0; i < logsSnap.docs.length; i += BATCH_SIZE) {
      const chunk = logsSnap.docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      let batchOps = 0;

      chunk.forEach((logDoc) => {
        const data = logDoc.data() || {};
        if (Object.prototype.hasOwnProperty.call(data, 'agencyId')) return;
        if (!DRY_RUN) {
          batch.set(logDoc.ref, { agencyId: null }, { merge: true });
          batchOps += 1;
        }
        updatedLogs += 1;
      });

      if (batchOps > 0) await batch.commit();
    }
  }

  console.log(`[users/*/callLogs] ${DRY_RUN ? 'would update' : 'updated'} ${updatedLogs} log rows`);
}

async function main() {
  if (!admin) {
    console.error('Firebase Admin unavailable — check credentials.');
    process.exit(1);
  }

  console.log(`Agency schema migration ${DRY_RUN ? '(DRY RUN)' : ''} starting...`);
  await backfillCollectionField('users', 'agencyId', null);
  await backfillCollectionField('phoneRoutes', 'agencyId', null);
  await backfillUserCallLogs();
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
