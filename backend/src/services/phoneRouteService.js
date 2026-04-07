const admin = require('../config/firebaseAdmin');
const { CAMPAIGN_CONFIG } = require('../config/pricing');

const COLLECTION = 'phoneRoutes';

function getDb() {
  if (!admin) return null;
  return admin.firestore();
}

function normalizePhoneE164(input) {
  if (!input || typeof input !== 'string') return '';
  let d = input.replace(/\D/g, '');
  if (d.length === 10) d = `1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (input.startsWith('+')) return `+${input.replace(/\D/g, '')}`;
  return d ? `+${d}` : '';
}

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

function ensureValidCampaign(campaignId) {
  if (!campaignId || typeof campaignId !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(CAMPAIGN_CONFIG, campaignId);
}

async function listPhoneRoutes() {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map((doc) => serializeDoc(doc))
    .sort((a, b) => String(a.phoneE164 || '').localeCompare(String(b.phoneE164 || '')));
}

/**
 * For incoming Twilio: resolve campaign from called number (active routes only).
 */
async function getCampaignByToNumber(toRaw) {
  const phoneE164 = normalizePhoneE164(toRaw);
  if (!phoneE164) return null;

  const db = getDb();
  if (!db) return null;

  const snap = await db.collection(COLLECTION).where('phoneE164', '==', phoneE164).limit(10).get();

  if (snap.empty) return null;
  const match = snap.docs.map((d) => d.data()).find((d) => d.active !== false);
  if (!match || typeof match.campaignId !== 'string') return null;
  return match.campaignId;
}

async function createPhoneRoute({ phoneE164, campaignId, label, active = true }) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const normalized = normalizePhoneE164(phoneE164);
  if (!normalized) throw new Error('Invalid phone number');
  if (!ensureValidCampaign(campaignId)) {
    throw new Error(`Invalid campaignId. Must be one of: ${Object.keys(CAMPAIGN_CONFIG).join(', ')}`);
  }

  const { FieldValue } = admin.firestore;
  const dup = await db.collection(COLLECTION).where('phoneE164', '==', normalized).limit(1).get();
  if (!dup.empty) throw new Error('A route for this phone number already exists');

  const ref = await db.collection(COLLECTION).add({
    phoneE164: normalized,
    campaignId,
    label: label || '',
    active: Boolean(active),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const created = await ref.get();
  return serializeDoc(created);
}

async function updatePhoneRoute(id, { phoneE164, campaignId, label, active }) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  if (!id || typeof id !== 'string') throw new Error('Invalid id');

  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Route not found');

  const { FieldValue } = admin.firestore;
  const patch = { updatedAt: FieldValue.serverTimestamp() };

  if (phoneE164 !== undefined) {
    const normalized = normalizePhoneE164(phoneE164);
    if (!normalized) throw new Error('Invalid phone number');
    const dup = await db
      .collection(COLLECTION)
      .where('phoneE164', '==', normalized)
      .limit(2)
      .get();
    const other = dup.docs.find((d) => d.id !== id);
    if (other) throw new Error('Another route already uses this phone number');
    patch.phoneE164 = normalized;
  }
  if (campaignId !== undefined) {
    if (!ensureValidCampaign(campaignId)) {
      throw new Error(`Invalid campaignId. Must be one of: ${Object.keys(CAMPAIGN_CONFIG).join(', ')}`);
    }
    patch.campaignId = campaignId;
  }
  if (label !== undefined) patch.label = String(label);
  if (active !== undefined) patch.active = Boolean(active);

  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return serializeDoc(updated);
}

async function deletePhoneRoute(id) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Route not found');
  await ref.delete();
  return { id };
}

module.exports = {
  listPhoneRoutes,
  createPhoneRoute,
  updatePhoneRoute,
  deletePhoneRoute,
  getCampaignByToNumber,
  normalizePhoneE164,
  COLLECTION,
};
