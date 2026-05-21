const { getFirestore } = require('firebase-admin/firestore');
const admin = require('./firebaseAdmin');
const { resolveFirestoreDatabaseId } = require('./resolveFirestoreDatabaseId');

function getDb() {
  if (!admin) return null;
  return getFirestore(admin.app(), resolveFirestoreDatabaseId());
}

module.exports = { getDb };
