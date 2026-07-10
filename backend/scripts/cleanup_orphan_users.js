#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Remove Firestore user docs with no matching Firebase Auth account.
 * These are usually leftover mock/seed users (settings.mock: true).
 *
 * Usage:
 *   node scripts/cleanup_orphan_users.js --dry-run
 *   node scripts/cleanup_orphan_users.js
 *   node scripts/cleanup_orphan_users.js --include-non-mock   # also delete orphans without settings.mock
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');

const DRY_RUN = process.argv.includes('--dry-run');
const INCLUDE_NON_MOCK = process.argv.includes('--include-non-mock');

async function deleteSubcollections(docRef) {
  const subcols = await docRef.listCollections();
  for (const col of subcols) {
    const snap = await col.get();
    if (snap.empty) continue;
    const batch = docRef.firestore.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (!DRY_RUN) await batch.commit();
    console.log(`  deleted ${snap.size} doc(s) from ${col.id}`);
  }
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

  const snap = await db.collection('users').get();
  const uids = snap.docs.map((d) => d.id);
  let removed = 0;
  let kept = 0;

  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100);
    // eslint-disable-next-line no-await-in-loop
    const authOut = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
    const found = new Set(authOut.users.map((u) => u.uid));

    for (const doc of snap.docs.filter((d) => chunk.includes(d.id))) {
      if (found.has(doc.id)) {
        kept += 1;
        continue;
      }
      const data = doc.data() || {};
      const isMock = Boolean(data.settings?.mock);
      if (!isMock && !INCLUDE_NON_MOCK) {
        console.log(`skip orphan (not mock): ${doc.id}`);
        kept += 1;
        continue;
      }

      removed += 1;
      console.log(`${DRY_RUN ? '[dry-run] ' : ''}remove orphan ${doc.id}${isMock ? ' (mock)' : ''}`);
      if (!DRY_RUN) {
        // eslint-disable-next-line no-await-in-loop
        await deleteSubcollections(doc.ref);
        // eslint-disable-next-line no-await-in-loop
        await doc.ref.delete();
      }
    }
  }

  console.log(`Done. removed=${removed} kept=${kept}${DRY_RUN ? ' (dry-run)' : ''}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
