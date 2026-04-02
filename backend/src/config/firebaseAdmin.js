const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.warn(
    '[Firebase Admin] firebase-service-account.json not found. Auth middleware will reject all requests.'
  );
  module.exports = null;
} else {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  module.exports = admin;
}
