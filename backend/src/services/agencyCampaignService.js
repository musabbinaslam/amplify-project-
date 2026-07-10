const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const { normalizeAgencyId } = require('../utils/tenancy');
const phoneRouteService = require('./phoneRouteService');

/**
 * Unlock all pricing campaigns tied to an agency (by agencyId field or allowlist).
 * @returns {Promise<{ unlockedCampaignIds: string[] }>}
 */
async function releaseCampaignsForAgency(agencyId, { lockedCampaignIds = [] } = {}) {
  const normalizedId = normalizeAgencyId(agencyId);
  if (!normalizedId) return { unlockedCampaignIds: [] };

  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const { FieldValue } = admin.firestore;
  const pricingRef = db.collection('system').doc('pricing');
  const pricingSnap = await pricingRef.get();
  const campaigns = { ...(pricingSnap.data()?.campaigns || {}) };
  const unlocked = new Set();
  const allowlist = new Set(
    (Array.isArray(lockedCampaignIds) ? lockedCampaignIds : []).filter(Boolean),
  );

  Object.keys(campaigns).forEach((campaignId) => {
    const meta = campaigns[campaignId];
    if (!meta || typeof meta !== 'object') return;
    const tiedToAgency = normalizeAgencyId(meta.agencyId) === normalizedId;
    const inAllowlist = allowlist.has(campaignId);
    if (!tiedToAgency && !inAllowlist) return;
    campaigns[campaignId] = { ...meta, locked: false, agencyId: null };
    unlocked.add(campaignId);
  });

  allowlist.forEach((campaignId) => {
    if (unlocked.has(campaignId)) return;
    const base = campaigns[campaignId] || CAMPAIGN_CONFIG[campaignId];
    if (!base) return;
    campaigns[campaignId] = {
      label: base.label || campaignId,
      buffer: Number(base.buffer) || 0,
      price: Number(base.price) || 0,
      locked: false,
      agencyId: null,
    };
    unlocked.add(campaignId);
  });

  if (unlocked.size > 0) {
    await pricingRef.set({ campaigns, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  return { unlockedCampaignIds: [...unlocked] };
}

/**
 * Revert phone routes for a deleted agency to the platform pool.
 * @returns {Promise<{ updatedRouteIds: string[] }>}
 */
async function releasePhoneRoutesForAgency(agencyId) {
  const normalizedId = normalizeAgencyId(agencyId);
  if (!normalizedId) return { updatedRouteIds: [] };

  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const snap = await db
    .collection(phoneRouteService.COLLECTION)
    .where('agencyId', '==', normalizedId)
    .get();

  if (snap.empty) return { updatedRouteIds: [] };

  const { FieldValue } = admin.firestore;
  const batch = db.batch();
  const updatedRouteIds = [];

  snap.docs.forEach((doc) => {
    batch.set(
      doc.ref,
      { agencyId: null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    updatedRouteIds.push(doc.id);
  });

  await batch.commit();
  return { updatedRouteIds };
}

/**
 * Full teardown of agency-owned routing resources (campaign locks + DIDs).
 */
async function releaseAgencyResources(agencyId, { lockedCampaignIds = [] } = {}) {
  const [campaigns, routes] = await Promise.all([
    releaseCampaignsForAgency(agencyId, { lockedCampaignIds }),
    releasePhoneRoutesForAgency(agencyId),
  ]);
  return {
    unlockedCampaignIds: campaigns.unlockedCampaignIds,
    updatedRouteIds: routes.updatedRouteIds,
  };
}

module.exports = {
  releaseCampaignsForAgency,
  releasePhoneRoutesForAgency,
  releaseAgencyResources,
};
