const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');

function parseServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Firebase Admin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    return null;
  }
}

function parseServiceAccountFromFields() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyB64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || (!privateKeyRaw && !privateKeyB64)) return null;

  // Hosting panels may:
  // - keep literal "\n" sequences
  // - store actual newlines
  // - wrap value in surrounding quotes
  let privateKey = '';
  if (privateKeyB64) {
    try {
      privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8').trim();
    } catch (err) {
      console.error('[Firebase Admin] Invalid FIREBASE_PRIVATE_KEY_BASE64:', err.message);
      return null;
    }
  } else {
    privateKey = privateKeyRaw.trim();
    if (
      (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

function loadServiceAccount() {
  const fromEnv = parseServiceAccountFromEnv();
  if (fromEnv) return fromEnv;
  const fromFields = parseServiceAccountFromFields();
  if (fromFields) return fromFields;
  if (fs.existsSync(serviceAccountPath)) {
    const fromFile = require(serviceAccountPath);
    const expectedProjectId = process.env.FIREBASE_PROJECT_ID;
    const fileProjectId = fromFile?.project_id;
    // Guard against silently using stale local credentials from another Firebase project.
    if (expectedProjectId && fileProjectId && expectedProjectId !== fileProjectId) {
      console.error(
        `[Firebase Admin] Service account project mismatch: FIREBASE_PROJECT_ID="${expectedProjectId}" but firebase-service-account.json project_id="${fileProjectId}".`
      );
      console.error(
        '[Firebase Admin] Provide matching admin credentials via FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or replace backend/firebase-service-account.json.'
      );
      return null;
    }
    return fromFile;
  }
  return null;
}

const serviceAccount = loadServiceAccount();

if (!serviceAccount) {
  console.warn(
    '[Firebase Admin] Missing service account. Set FIREBASE_SERVICE_ACCOUNT_JSON or add backend/firebase-service-account.json.'
  );
  module.exports = null;
} else {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  const firestoreNamespace = admin.firestore;
  const firestoreDb = getFirestore(admin.app(), firestoreDatabaseId);

  // Make all admin.firestore() callers use configured database ID.
  // Preserve static helpers like FieldValue and Timestamp.
  const firestoreAccessor = () => firestoreDb;
  Object.keys(firestoreNamespace).forEach((k) => {
    firestoreAccessor[k] = firestoreNamespace[k];
  });
  admin.firestore = firestoreAccessor;
  console.log(`[Firebase Admin] Using Firestore database "${firestoreDatabaseId}"`);
  module.exports = admin;
}
