const { CAMPAIGN_CONFIG } = require('../config/pricing');
const agencyService = require('./agencyService');
const { normalizeAgencyId } = require('../utils/tenancy');

function getCampaignMeta(campaignId) {
  const cfg = CAMPAIGN_CONFIG[campaignId];
  if (!cfg) return null;
  return {
    id: campaignId,
    label: cfg.label || campaignId,
    buffer: cfg.buffer,
    price: cfg.price,
    agencyId: normalizeAgencyId(cfg.agencyId),
    locked: Boolean(cfg.locked),
  };
}

function isLockedAgencyCampaign(campaignId) {
  const meta = getCampaignMeta(campaignId);
  return Boolean(meta?.locked && meta?.agencyId);
}

async function getKnownAgencyIds() {
  const agencies = await agencyService.listAgencies();
  return new Set(
    agencies
      .filter((a) => agencyService.isAgencyOperable(a))
      .map((a) => String(a.id)),
  );
}

function isActiveAgencyLock(meta, knownAgencyIds) {
  if (!meta?.locked || !meta.agencyId) return false;
  return knownAgencyIds.has(meta.agencyId);
}

/**
 * Returns null if allowed, or an error message if blocked.
 */
async function validateAgentCampaignAccess(agentAgencyId, campaignId) {
  const userAgencyId = normalizeAgencyId(agentAgencyId);
  const meta = getCampaignMeta(campaignId);

  if (!meta) return `Unknown campaign: ${campaignId}`;

  if (userAgencyId) {
    const agency = await agencyService.getAgencyById(userAgencyId);
    if (!agency) return 'Agency not found';
    if (agency.status === 'pending') {
      return 'Your agency is pending approval. You cannot take calls yet.';
    }
    if (agency.status === 'rejected') {
      return 'Your agency application was rejected. Contact support for help.';
    }
    if (agency.status === 'suspended' || !agencyService.isAgencyOperable(agency)) {
      return 'Your agency account is suspended';
    }
    const allowed = Array.isArray(agency.lockedCampaignIds) ? agency.lockedCampaignIds : [];
    if (!allowed.includes(campaignId)) {
      return 'This campaign is not assigned to your agency';
    }
    return null;
  }

  if (meta.locked && meta.agencyId) {
    const knownAgencyIds = await getKnownAgencyIds();
    if (isActiveAgencyLock(meta, knownAgencyIds)) {
      return 'This campaign is reserved for agency agents only';
    }
  }

  return null;
}

/**
 * Sync helper for non-agency / pricing-lock filtering only.
 * Agency membership + operable status require listCampaignsForAgentAsync.
 */
function listCampaignsForAgent(agentAgencyId) {
  const userAgencyId = normalizeAgencyId(agentAgencyId);
  // Agency callers must use the async path (operable check + lockedCampaignIds).
  if (userAgencyId) return [];
  return Object.keys(CAMPAIGN_CONFIG)
    .map((id) => getCampaignMeta(id))
    .filter((meta) => {
      if (!meta) return false;
      return !meta.locked || !meta.agencyId;
    });
}

/**
 * Agency agents may ONLY see campaigns in their agency's lockedCampaignIds list.
 * Platform agents see all non-agency-locked campaigns (ignoring locks for deleted agencies).
 */
async function listCampaignsForAgentAsync(agentAgencyId) {
  const userAgencyId = normalizeAgencyId(agentAgencyId);

  if (userAgencyId) {
    const agency = await agencyService.getAgencyById(userAgencyId);
    if (!agency || !agencyService.isAgencyOperable(agency)) return [];
    const allowed = Array.isArray(agency.lockedCampaignIds) ? agency.lockedCampaignIds.filter(Boolean) : [];
    return allowed
      .map((id) => getCampaignMeta(id))
      .filter((meta) => {
        if (!meta) return false;
        // Prefer pricing lock flags when present; always trust admin allowlist.
        if (meta.agencyId && meta.agencyId !== userAgencyId) return false;
        return true;
      });
  }

  const knownAgencyIds = await getKnownAgencyIds();
  return Object.keys(CAMPAIGN_CONFIG)
    .map((id) => getCampaignMeta(id))
    .filter((meta) => {
      if (!meta) return false;
      return !isActiveAgencyLock(meta, knownAgencyIds);
    });
}

module.exports = {
  getCampaignMeta,
  isLockedAgencyCampaign,
  validateAgentCampaignAccess,
  listCampaignsForAgent,
  listCampaignsForAgentAsync,
};
