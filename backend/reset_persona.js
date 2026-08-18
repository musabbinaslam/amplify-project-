const admin = require('./src/config/firebaseAdmin');
async function reset() {
  const db = admin.firestore();
  const snapshot = await db.collection('users').get();
  let count = 0;
  for (const doc of snapshot.docs) {
    if (doc.data().personaStatus === 'verified') {
      await doc.ref.update({ personaStatus: 'unverified' });
      count++;
    }
  }
  console.log(`Reset ${count} users to unverified.`);
  process.exit(0);
}
reset();
