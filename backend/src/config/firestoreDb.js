const { getFirestore } = require('firebase-admin/firestore');
const admin = require('./firebaseAdmin');

function getDb() {
  if (!admin) return null;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  return getFirestore(admin.app(), databaseId);
}

module.exports = { getDb };
