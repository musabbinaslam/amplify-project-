const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { normalizeAgencyId, isPlatformRole } = require('../utils/tenancy');

const COLLECTION = 'agencies';

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

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `agency-${Date.now()}`;
}

async function listAgencies() {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map((doc) => serializeDoc(doc))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function getAgencyById(id) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  return serializeDoc(snap);
}

async function createAgency({ name, slug, status = 'active', lockedCampaignIds = [], settings = {} }) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Agency name is required');

  const { FieldValue } = admin.firestore;
  const finalSlug = slugify(slug || trimmedName);

  const dup = await db.collection(COLLECTION).where('slug', '==', finalSlug).limit(1).get();
  if (!dup.empty) throw new Error('An agency with this slug already exists');

  const ref = await db.collection(COLLECTION).add({
    name: trimmedName,
    slug: finalSlug,
    status: status === 'suspended' ? 'suspended' : 'active',
    lockedCampaignIds: Array.isArray(lockedCampaignIds) ? lockedCampaignIds.filter(Boolean) : [],
    settings: settings && typeof settings === 'object' ? settings : {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const created = await ref.get();
  return serializeDoc(created);
}

async function updateAgency(id, patch = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Agency not found');

  const { FieldValue } = admin.firestore;
  const update = { updatedAt: FieldValue.serverTimestamp() };

  if (patch.name !== undefined) {
    const trimmedName = String(patch.name || '').trim();
    if (!trimmedName) throw new Error('Agency name cannot be empty');
    update.name = trimmedName;
  }
  if (patch.slug !== undefined) {
    const finalSlug = slugify(patch.slug);
    const dup = await db.collection(COLLECTION).where('slug', '==', finalSlug).limit(2).get();
    const other = dup.docs.find((d) => d.id !== id);
    if (other) throw new Error('Another agency already uses this slug');
    update.slug = finalSlug;
  }
  if (patch.status !== undefined) {
    update.status = patch.status === 'suspended' ? 'suspended' : 'active';
  }
  if (patch.lockedCampaignIds !== undefined) {
    if (!Array.isArray(patch.lockedCampaignIds)) throw new Error('lockedCampaignIds must be an array');
    update.lockedCampaignIds = patch.lockedCampaignIds.filter(Boolean);
  }
  if (patch.settings !== undefined) {
    update.settings = patch.settings && typeof patch.settings === 'object' ? patch.settings : {};
  }

  await ref.set(update, { merge: true });
  const updated = await ref.get();
  return serializeDoc(updated);
}

async function deleteAgency(id) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Agency not found');

  const members = await db.collection('users').where('agencyId', '==', id).limit(1).get();
  if (!members.empty) throw new Error('Cannot delete agency with assigned users');

  await ref.delete();
  return { id };
}

async function countAgencyMembers(agencyId) {
  const db = getDb();
  if (!db) return 0;
  const snap = await db.collection('users').where('agencyId', '==', String(agencyId)).get();
  return snap.size;
}

async function listAgencyMemberIds(agencyId) {
  const db = getDb();
  if (!db) return [];
  const snap = await db.collection('users').where('agencyId', '==', String(agencyId)).select().get();
  return snap.docs.map((d) => d.id);
}

async function assignUserToAgency(uid, { agencyId, role = 'agency_agent' }) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const normalizedAgencyId = normalizeAgencyId(agencyId);
  const allowedRoles = ['agency_agent', 'agency_admin'];
  if (!allowedRoles.includes(role)) throw new Error('Invalid agency role');

  if (normalizedAgencyId) {
    const agency = await getAgencyById(normalizedAgencyId);
    if (!agency) throw new Error('Agency not found');
    if (agency.status === 'suspended') throw new Error('Agency is suspended');
  }

  const userRef = db.collection('users').doc(String(uid));
  const existingSnap = await userRef.get();
  const existing = existingSnap.exists ? existingSnap.data() || {} : {};
  const existingRole = existing.role || 'agent';

  const { FieldValue } = admin.firestore;
  const patch = {
    agencyId: normalizedAgencyId,
    managedAgents: [],
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (normalizedAgencyId) {
    patch.agencyRole = role;
    // Platform admins/qa/managers keep their platform role when added to an agency.
    patch.role = isPlatformRole(existingRole) ? existingRole : role;
  } else {
    patch.agencyRole = null;
    if (existingRole === 'agency_admin' || existingRole === 'agency_agent') {
      patch.role = 'agent';
    }
  }

  await userRef.set(patch, { merge: true });
  return { uid, ...patch, membershipRole: patch.agencyRole || role };
}

module.exports = {
  COLLECTION,
  listAgencies,
  getAgencyById,
  createAgency,
  updateAgency,
  deleteAgency,
  countAgencyMembers,
  listAgencyMemberIds,
  assignUserToAgency,
  slugify,
};
