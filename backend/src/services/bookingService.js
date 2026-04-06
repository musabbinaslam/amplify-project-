const admin = require('../config/firebaseAdmin');

function getDb() {
  if (!admin) return null;
  return admin.firestore();
}

function bookingsRef() {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  return db.collection('bookings');
}

async function upsertCalendlyBooking(event) {
  const ref = bookingsRef();
  const id = event.uri || event.uuid || event.id;
  if (!id) throw new Error('Missing booking id');

  const { FieldValue } = admin.firestore;

  const data = {
    provider: 'calendly',
    bookingId: id,
    eventUri: event.uri || null,
    status: event.status || 'scheduled',
    startsAt: event.start_time || null,
    endsAt: event.end_time || null,
    inviteeName: event.invitee?.name || null,
    inviteeEmail: event.invitee?.email || null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.doc(id).set(
    {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function listBookings(limit = 50) {
  const ref = bookingsRef();
  const snap = await ref
    .orderBy('startsAt', 'asc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  upsertCalendlyBooking,
  listBookings,
};

