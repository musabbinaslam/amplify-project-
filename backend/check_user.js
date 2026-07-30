const admin = require('./src/config/firebaseAdmin');

async function checkUser() {
  try {
    const db = admin.firestore();
    const usersSnap = await db.collection('users').get();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      console.log(`User: ${data.email || data.name || doc.id}, agencyId: ${data.agencyId || 'none'}`);
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkUser();
