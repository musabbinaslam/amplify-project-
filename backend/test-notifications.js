require('dotenv').config();
const admin = require('./src/config/firebaseAdmin');
const { getDb } = require('./src/config/firestoreDb');

async function run() {
  const db = getDb();
  const uid = 'xEEzK0hV4sSR8Uyb6p9DIjWEzvy2';
  const snap = await db.collection('users').doc(uid).collection('notifications').orderBy('createdAtIso', 'desc').limit(5).get();
  snap.forEach(doc => {
    console.log(doc.id, doc.data().title, doc.data().createdAtIso);
  });
  process.exit(0);
}
run();
