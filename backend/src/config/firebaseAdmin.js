const admin = require('firebase-admin');
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
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) return null;

  // Hosting panels usually store \n as text; convert to real newlines.
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
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
  if (fs.existsSync(serviceAccountPath)) return require(serviceAccountPath);
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
  module.exports = admin;
}
