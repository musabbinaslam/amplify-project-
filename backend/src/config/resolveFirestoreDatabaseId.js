/**
 * Firestore database ID for Admin SDK getFirestore(app, databaseId).
 * - Unset → "(default)" (classic Firebase default database)
 * - "default" → named database "default" (valid on callsflow-stage; do not rewrite to "(default)")
 */
function resolveFirestoreDatabaseId() {
  const raw = String(process.env.FIRESTORE_DATABASE_ID || '').trim();
  if (!raw) return '(default)';
  return raw;
}

module.exports = { resolveFirestoreDatabaseId };
