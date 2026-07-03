/**
 * One-time script: Fix the system/pricing Firestore document.
 * - Removes fe_inbounds (45$/90s)
 * - Sets fe_tv_calls price to 65
 *
 * Run: node tools/fix-pricing.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

// ── Mirror the same credential loading logic as firebaseAdmin.js ──────────────
function loadServiceAccount() {
  // 1. JSON blob in env
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { console.error('Bad FIREBASE_SERVICE_ACCOUNT_JSON'); }
  }
  // 2. Individual fields
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw  = process.env.FIREBASE_PRIVATE_KEY;
  const privateKeyB64  = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  if (projectId && clientEmail && (privateKeyRaw || privateKeyB64)) {
    let privateKey = privateKeyB64
      ? Buffer.from(privateKeyB64, 'base64').toString('utf8').trim()
      : privateKeyRaw.trim().replace(/\\n/g, '\n');
    return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
  }
  // 3. Local JSON file
  const filePath = path.resolve(__dirname, '../firebase-service-account.json');
  if (fs.existsSync(filePath)) return require(filePath);
  return null;
}

const serviceAccount = loadServiceAccount();
if (!serviceAccount) {
  console.error('❌ Could not load Firebase service account credentials.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Use the same database ID as the server
const databaseId = process.env.FIRESTORE_DATABASE_ID || 'default';
const db = getFirestore(admin.app(), databaseId);

console.log(`\n🔗 Connected to Firebase project: ${serviceAccount.project_id}`);
console.log(`📦 Firestore database: ${databaseId}`);

async function fixPricing() {
  const ref = db.collection('system').doc('pricing');
  const snap = await ref.get();

  if (!snap.exists) {
    console.error('❌ system/pricing document does not exist in Firestore!');
    process.exit(1);
  }

  const data = snap.data();
  const campaigns = { ...(data.campaigns || {}) };

  console.log('\n📋 Current campaigns in Firestore:');
  Object.entries(campaigns).forEach(([id, cfg]) => {
    console.log(`  ${id}: $${cfg.price} / ${cfg.buffer}s`);
  });

  const updates = {};

  // 1. Remove fe_inbounds (45$/90s)
  if (campaigns.fe_inbounds) {
    console.log('\n🗑️  Removing fe_inbounds campaign...');
    updates['campaigns.fe_inbounds'] = admin.firestore.FieldValue.delete();
  } else {
    console.log('\nℹ️  fe_inbounds not found (already removed).');
  }

  // 2. Fix fe_tv_calls price to $65
  if (campaigns.fe_tv_calls) {
    console.log(`🔧  Updating fe_tv_calls price: $${campaigns.fe_tv_calls.price} → $65`);
    updates['campaigns.fe_tv_calls.price'] = 65;
  } else {
    console.log('⚠️  fe_tv_calls not found in Firestore!');
  }

  if (Object.keys(updates).length === 0) {
    console.log('\n✅ Nothing to update — Firestore already has the correct data!');
    process.exit(0);
  }

  await ref.update(updates);

  console.log('\n✅ Done! Updated campaigns in Firestore:');
  const updated = (await ref.get()).data().campaigns || {};
  Object.entries(updated).forEach(([id, cfg]) => {
    console.log(`  ${id}: $${cfg.price} / ${cfg.buffer}s`);
  });

  process.exit(0);
}

fixPricing().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
