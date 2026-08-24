const admin = require('./src/config/firebaseAdmin');
async function check() {
  const db = admin.firestore();
  const snapshot = await db.collection('users').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.personaStatus) {
      console.log(`User ${doc.id} -> ${data.personaStatus} (email: ${data.email})`);
    }
  }
  process.exit(0);
}
check();
