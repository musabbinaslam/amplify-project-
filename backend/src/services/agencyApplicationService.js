const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const agencyService = require('./agencyService');

const COLLECTION = 'agencyApplications';

const AGENCY_SIZES = new Set(['1-5', '6-20', '21-50', '51+']);
const STATUSES = new Set(['pending', 'approved', 'rejected']);

function serializeDoc(doc) {
  const d = doc.data();
  if (!d) return { id: doc.id };
  const out = { id: doc.id };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits;
}

function validateApplicationInput(input = {}) {
  const contactName = String(input.contactName || '').trim();
  const agencyName = String(input.agencyName || '').trim();
  const agencySize = String(input.agencySize || '').trim();
  const phone = String(input.phone || '').trim();
  const website = String(input.website || '').trim().slice(0, 200);
  const message = String(input.message || '').trim().slice(0, 2000);
  const applicantEmail = String(input.applicantEmail || '').trim().toLowerCase();

  if (!contactName) throw new Error('Contact name is required');
  if (!agencyName) throw new Error('Agency name is required');
  if (!AGENCY_SIZES.has(agencySize)) {
    throw new Error('Agency size must be one of: 1-5, 6-20, 21-50, 51+');
  }
  const digits = normalizePhone(phone);
  if (!digits || digits.length < 10) {
    throw new Error('A valid phone number is required (at least 10 digits)');
  }

  return {
    contactName: contactName.slice(0, 120),
    agencyName: agencyName.slice(0, 120),
    agencySize,
    phone,
    website: website || '',
    message: message || '',
    applicantEmail,
  };
}

async function createApplication({
  applicantUid,
  applicantEmail,
  contactName,
  phone,
  agencyName,
  agencySize,
  website,
  message,
}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  if (!applicantUid) throw new Error('Applicant uid is required');

  const existing = await db
    .collection(COLLECTION)
    .where('applicantUid', '==', String(applicantUid))
    .limit(20)
    .get();
  const hasPending = existing.docs.some((doc) => (doc.data() || {}).status === 'pending');
  if (hasPending) {
    throw new Error('You already have a pending agency application');
  }

  const cleaned = validateApplicationInput({
    contactName,
    agencyName,
    agencySize,
    phone,
    website,
    message,
    applicantEmail,
  });

  const { FieldValue } = admin.firestore;
  const ref = await db.collection(COLLECTION).add({
    applicantUid: String(applicantUid),
    applicantEmail: cleaned.applicantEmail,
    contactName: cleaned.contactName,
    phone: cleaned.phone,
    agencyName: cleaned.agencyName,
    agencySize: cleaned.agencySize,
    website: cleaned.website,
    message: cleaned.message,
    status: 'pending',
    reviewedAt: null,
    reviewedBy: null,
    rejectReason: null,
    agencyId: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const created = await ref.get();
  return serializeDoc(created);
}

async function getApplicationById(id) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const snap = await db.collection(COLLECTION).doc(String(id)).get();
  if (!snap.exists) return null;
  return serializeDoc(snap);
}

async function listApplications({ status } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  let snap;
  if (status && STATUSES.has(status)) {
    snap = await db.collection(COLLECTION).where('status', '==', status).get();
  } else {
    snap = await db.collection(COLLECTION).get();
  }

  return snap.docs
    .map((doc) => serializeDoc(doc))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function approveApplication(id, { reviewedBy } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Application not found');

  const data = snap.data() || {};
  if (data.status !== 'pending') {
    throw new Error(`Application is already ${data.status}`);
  }

  const agency = await agencyService.createAgency({
    name: data.agencyName,
    status: 'active',
  });

  await agencyService.assignUserToAgency(data.applicantUid, {
    agencyId: agency.id,
    role: 'agency_admin',
  });

  const { FieldValue } = admin.firestore;
  await ref.set(
    {
      status: 'approved',
      agencyId: agency.id,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: reviewedBy || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const userRef = db.collection('users').doc(String(data.applicantUid));
  await userRef.set(
    {
      agencySignupStatus: 'approved',
      agencyApplicationId: String(id),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const updated = await ref.get();
  return {
    application: serializeDoc(updated),
    agency,
  };
}

async function rejectApplication(id, { reviewedBy, reason } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Application not found');

  const data = snap.data() || {};
  if (data.status !== 'pending') {
    throw new Error(`Application is already ${data.status}`);
  }

  const { FieldValue } = admin.firestore;
  const rejectReason = String(reason || '').trim().slice(0, 500) || null;

  await ref.set(
    {
      status: 'rejected',
      rejectReason,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: reviewedBy || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const userRef = db.collection('users').doc(String(data.applicantUid));
  await userRef.set(
    {
      agencySignupStatus: 'rejected',
      agencyApplicationId: String(id),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const updated = await ref.get();
  return { application: serializeDoc(updated) };
}

function isAgencySignupGated(userDoc) {
  const status = String(userDoc?.agencySignupStatus || '');
  return status === 'pending' || status === 'rejected';
}

module.exports = {
  COLLECTION,
  AGENCY_SIZES,
  createApplication,
  getApplicationById,
  listApplications,
  approveApplication,
  rejectApplication,
  validateApplicationInput,
  isAgencySignupGated,
};
