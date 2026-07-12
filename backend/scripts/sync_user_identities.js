#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill Firestore user docs with name + email from Firebase Auth.
 *
 * Usage:
 *   node scripts/sync_user_identities.js --dry-run
 *   node scripts/sync_user_identities.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');

const DRY_RUN = process.argv.includes('--dry-run');

function hasRealName(data = {}) {
  const firstLast = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
  return Boolean(
    data.fullName ||
    data.displayName ||
    data.name ||
    data.agentName ||
    firstLast,
  );
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
  let updated = 0;
  let skipped = 0;
  let orphaned = 0;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 100) {
    const chunk = docs.slice(i, i + 100);
    // eslint-disable-next-line no-await-in-loop
    const authOut = await admin.auth().getUsers(chunk.map((doc) => ({ uid: doc.id })));
    const authByUid = new Map(authOut.users.map((u) => [u.uid, u]));
    const notFound = new Set((authOut.notFound || []).map((row) => row.uid));

    for (const doc of chunk) {
      const data = doc.data() || {};
      const authUser = authByUid.get(doc.id);
      if (!authUser) {
        if (notFound.has(doc.id)) orphaned += 1;
        skipped += 1;
        continue;
      }

      const patch = {};
      if (!data.email && authUser.email) patch.email = authUser.email;

      if (!hasRealName(data)) {
        const authName = String(authUser.displayName || '').trim();
        if (authName && authName !== doc.id) {
          patch.name = authName;
          patch.displayName = authName;
          patch.fullName = authName;
        } else if (authUser.email) {
          const localPart = authUser.email.split('@')[0];
          if (localPart) {
            patch.name = localPart;
            patch.displayName = localPart;
            patch.fullName = localPart;
          }
        }
      }

      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }

      updated += 1;
      const label = patch.fullName || patch.email || doc.id;
      console.log(`${DRY_RUN ? '[dry-run] ' : ''}sync ${doc.id} -> ${label}`);
      if (!DRY_RUN) {
        // eslint-disable-next-line no-await-in-loop
        await doc.ref.set(
          { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }
  }

  console.log(`Done. updated=${updated} skipped=${skipped} orphaned=${orphaned}${DRY_RUN ? ' (dry-run)' : ''}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
