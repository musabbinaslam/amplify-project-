#!/usr/bin/env node
/**
 * Restore platform role after accidental agency assignment demoted an admin.
 *
 * Usage:
 *   node scripts/restore_platform_role.js --uid=YOUR_UID --role=admin
 *   node scripts/restore_platform_role.js --email=you@example.com --role=admin
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const admin = require('../src/config/firebaseAdmin');
const { getDb } = require('../src/config/firestoreDb');

const args = process.argv.slice(2);
function readArg(name) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
}

async function resolveUid() {
  const uid = readArg('uid');
  if (uid) return uid;
  const email = readArg('email');
  if (!email) throw new Error('Pass --uid=... or --email=...');
  const user = await admin.auth().getUserByEmail(email);
  return user.uid;
}

async function main() {
  if (!admin) throw new Error('Firebase Admin unavailable');
  const db = getDb();
  const uid = await resolveUid();
  const role = readArg('role') || 'admin';
  const keepAgency = args.includes('--keep-agency');

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`User doc not found: ${uid}`);

  const patch = {
    role,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!keepAgency) {
    patch.agencyId = null;
    patch.agencyRole = null;
  }
  if (role === 'admin' || role === 'qa') {
    patch.managedAgents = admin.firestore.FieldValue.delete();
    patch.teamName = admin.firestore.FieldValue.delete();
  }

  await ref.set(patch, { merge: true });
  console.log(`Restored users/${uid}: role=${role}${keepAgency ? ' (kept agency membership)' : ' (cleared agency)'}${role === 'admin' || role === 'qa' ? ' (cleared manager team fields)' : ''}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
