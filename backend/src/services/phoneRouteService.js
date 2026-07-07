const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { CAMPAIGN_CONFIG } = require('../config/pricing');

const COLLECTION = 'phoneRoutes';

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
 * For incoming Twilio: resolve campaign + agency from called number (active routes only).
 * @returns {{ campaignId: string, agencyId: string|null }|null}
 */
async function getRouteByToNumber(toRaw) {
  const phoneE164 = normalizePhoneE164(toRaw);
  if (!phoneE164) return null;

  const db = getDb();
  if (!db) return null;

  const snap = await db.collection(COLLECTION).where('phoneE164', '==', phoneE164).limit(10).get();

  if (snap.empty) return null;
  const match = snap.docs.map((d) => d.data()).find((d) => d.active !== false);
  if (!match || typeof match.campaignId !== 'string') return null;
  return {
    campaignId: match.campaignId,
    agencyId: match.agencyId == null || match.agencyId === '' ? null : String(match.agencyId),
  };
}

/** @deprecated use getRouteByToNumber */
async function getCampaignByToNumber(toRaw) {
  const route = await getRouteByToNumber(toRaw);
  return route?.campaignId ?? null;
}

async function createPhoneRoute({ phoneE164, campaignId, label, active = true, agencyId = null }) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const normalized = normalizePhoneE164(phoneE164);
  if (!normalized) throw new Error('Invalid phone number');
  if (!ensureValidCampaign(campaignId)) {
    throw new Error(`Invalid campaignId. Must be one of: ${Object.keys(CAMPAIGN_CONFIG).join(', ')}`);
  }

  const normalizedAgencyId = agencyId == null || agencyId === '' ? null : String(agencyId).trim();

  // If a campaign is agency-locked, every DID assigned to it MUST have an agencyId.
  // Without it the router will look in the wrong Redis pool and agency agents will never
  // receive calls (they are registered under pool:<agencyId>:<campaign>, not pool:platform:<campaign>).
  const campaignCfg = CAMPAIGN_CONFIG[campaignId];
  if (campaignCfg?.locked && campaignCfg?.agencyId && !normalizedAgencyId) {
    throw new Error(
      `Campaign "${campaignId}" is agency-locked. An agencyId is required when creating a phone route for this campaign.`,
    );
  }

  const { FieldValue } = admin.firestore;
  const dup = await db.collection(COLLECTION).where('phoneE164', '==', normalized).limit(1).get();
  if (!dup.empty) throw new Error('A route for this phone number already exists');

  const ref = await db.collection(COLLECTION).add({
    phoneE164: normalized,
    campaignId,
    label: label || '',
    active: Boolean(active),
    agencyId: normalizedAgencyId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const created = await ref.get();
  return serializeDoc(created);
}

async function updatePhoneRoute(id, { phoneE164, campaignId, label, active, agencyId }) {
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
  if (agencyId !== undefined) {
    patch.agencyId = agencyId == null || agencyId === '' ? null : String(agencyId).trim();
  }

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
  getRouteByToNumber,
  normalizePhoneE164,
  COLLECTION,
};
