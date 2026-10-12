const agencyService = require('../services/agencyService');
const agencyCampaignService = require('../services/agencyCampaignService');
const phoneRouteService = require('../services/phoneRouteService');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { normalizeAgencyId, getAgencyMembershipRole, isPlatformRole } = require('../utils/tenancy');
const managerController = require('./managerController');
const {
  notifyAdminsInBackground,
  notifyAgent,
} = require('../services/notificationService');
const socketRegistry = require('../sockets/socketRegistry');

async function getAgencyMe(req, res) {
  try {
    const agencyId = normalizeAgencyId(req.agencyId);
    if (!agencyId) {
      return res.status(404).json({ error: 'No agency assigned' });
    }
    const agency = await agencyService.getAgencyById(agencyId);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    const agentCount = await agencyService.countAgencyMembers(agencyId);
    res.json({
      agency: {
        ...agency,
        agentCount,
        lockedCampaignIds: Array.isArray(agency.lockedCampaignIds) ? agency.lockedCampaignIds : [],
      },
    });
  } catch (err) {
    console.error('[Agency] getAgencyMe:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load agency' });
  }
}

async function listAgencies(req, res) {
  try {
    const status = req.query?.status ? String(req.query.status).trim() : undefined;
    const agencies = await agencyService.listAgencies({ status });
    const withCounts = await Promise.all(
      agencies.map(async (a) => ({
        ...a,
        agentCount: await agencyService.countAgencyMembers(a.id),
      })),
    );
    res.json({ agencies: withCounts });
  } catch (err) {
    console.error('[Agency] listAgencies:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list agencies' });
  }
}

async function resolveAgencyInvite(req, res) {
  try {
    const resolved = await agencyService.resolveInviteCode(req.params.code);
    if (!resolved.valid) {
      return res.status(404).json({ error: 'Invite code not found', valid: false });
    }
    res.json({
      valid: true,
      code: resolved.code,
      name: resolved.name,
    });
  } catch (err) {
    console.error('[Agency] resolveAgencyInvite:', err.message);
    res.status(500).json({ error: err.message || 'Failed to resolve invite' });
  }
}

async function claimAgencyInvite(req, res) {
  try {
    const code = req.body?.code;
    const result = await agencyService.claimInviteCode(req.user.uid, code);
    res.json({
      success: true,
      agencyId: result.agencyId,
      agencyName: result.agencyName,
      role: result.membershipRole || 'agency_agent',
    });
  } catch (err) {
    console.error('[Agency] claimAgencyInvite:', err.message);
    const status = /already|Invalid|inactive|Platform/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to join agency' });
  }
}

async function registerAgency(req, res) {
  try {
    const { name, website } = req.body || {};
    const agency = await agencyService.registerAgencyApplication(req.user.uid, { name, website });
    const app = agency.application || {};
    const linkPath = `/app/admin/agencies?tab=applications&agencyId=${encodeURIComponent(agency.id)}`;

    notifyAdminsInBackground({
      type: 'admin_alert',
      title: 'New agency application',
      body: `${app.founderName || 'Someone'} applied for "${agency.name}"${app.founderEmail ? ` (${app.founderEmail})` : ''}`,
      priority: 'high',
      linkPath,
    }, 'agency_register');

    res.status(201).json({ agency });
  } catch (err) {
    console.error('[Agency] registerAgency:', err.message);
    const status = /already|required|Platform|profile/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to register agency' });
  }
}

async function reapplyAgency(req, res) {
  try {
    await agencyService.clearRejectedMembershipForReapply(req.user.uid);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Agency] reapplyAgency:', err.message);
    const status = /Only rejected|not assigned|founder|profile/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to clear application' });
  }
}

async function getAgencyInvite(req, res) {
  try {
    const agencyId = normalizeAgencyId(req.agencyId);
    if (!agencyId) return res.status(404).json({ error: 'No agency assigned' });
    const agency = await agencyService.getAgencyById(agencyId);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    if (!agencyService.isAgencyOperable(agency)) {
      return res.status(403).json({ error: 'Invite codes are only available after approval' });
    }
    const code = await agencyService.ensureInviteCode(agencyId);
    res.json({
      code,
      shareUrl: agencyService.buildInviteShareUrl(code),
      joinUrl: agencyService.buildInviteJoinUrl(code),
      agencyName: agency.name,
      status: agency.status,
    });
  } catch (err) {
    console.error('[Agency] getAgencyInvite:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load invite' });
  }
}

async function rotateAgencyInvite(req, res) {
  try {
    const agencyId = normalizeAgencyId(req.agencyId);
    if (!agencyId) return res.status(404).json({ error: 'No agency assigned' });
    const out = await agencyService.rotateInviteCode(agencyId);
    res.json(out);
  } catch (err) {
    console.error('[Agency] rotateAgencyInvite:', err.message);
    const status = /only available|not found/i.test(err.message) ? 403 : 400;
    res.status(status).json({ error: err.message || 'Failed to rotate invite' });
  }
}

async function approveAgency(req, res) {
  try {
    const agency = await agencyService.approveAgency(req.params.id, {
      reviewedBy: req.user.uid,
    });
    const founderUid = agency.createdByUid || agency.application?.founderUid;
    if (founderUid) {
      try {
        const realtime = await notifyAgent(founderUid, {
          type: 'personal',
          title: 'Agency approved',
          body: `"${agency.name}" is approved. You can invite agents and open your agency dashboard.`,
          priority: 'high',
          linkPath: '/app/agency',
        }, 'agency_approve');
        if (realtime) await socketRegistry.emitToAgent(founderUid, 'notification:new', realtime);
      } catch (notifyErr) {
        console.warn('[Agency] Founder approve notify failed:', notifyErr.message);
      }
    }
    res.json({ agency });
  } catch (err) {
    console.error('[Agency] approveAgency:', err.message);
    const status = err.message === 'Agency not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to approve agency' });
  }
}

async function rejectAgency(req, res) {
  try {
    const reason = req.body?.reason;
    const agency = await agencyService.rejectAgency(req.params.id, {
      reason,
      reviewedBy: req.user.uid,
    });
    const founderUid = agency.createdByUid || agency.application?.founderUid;
    if (founderUid) {
      try {
        const realtime = await notifyAgent(founderUid, {
          type: 'personal',
          title: 'Agency application update',
          body: agency.rejectReason
            ? `"${agency.name}" was not approved: ${agency.rejectReason}`
            : `"${agency.name}" was not approved. Contact support if you have questions.`,
          priority: 'high',
          linkPath: '/app/agency',
        }, 'agency_reject');
        if (realtime) await socketRegistry.emitToAgent(founderUid, 'notification:new', realtime);
      } catch (notifyErr) {
        console.warn('[Agency] Founder reject notify failed:', notifyErr.message);
      }
    }
    res.json({ agency });
  } catch (err) {
    console.error('[Agency] rejectAgency:', err.message);
    const status = err.message === 'Agency not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to reject agency' });
  }
}

/** Admin: invite details for a specific agency (members tab). */
async function getAdminAgencyInvite(req, res) {
  try {
    const agency = await agencyService.getAgencyById(req.params.id);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    if (!agencyService.isAgencyOperable(agency)) {
      return res.json({
        code: null,
        shareUrl: null,
        joinUrl: null,
        agencyName: agency.name,
        status: agency.status,
      });
    }
    const code = await agencyService.ensureInviteCode(agency.id);
    res.json({
      code,
      shareUrl: agencyService.buildInviteShareUrl(code),
      joinUrl: agencyService.buildInviteJoinUrl(code),
      agencyName: agency.name,
      status: agency.status,
    });
  } catch (err) {
    console.error('[Agency] getAdminAgencyInvite:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load invite' });
  }
}

async function rotateAdminAgencyInvite(req, res) {
  try {
    const out = await agencyService.rotateInviteCode(req.params.id);
    res.json(out);
  } catch (err) {
    console.error('[Agency] rotateAdminAgencyInvite:', err.message);
    const status = /only available|not found/i.test(err.message) ? 403 : 400;
    res.status(status).json({ error: err.message || 'Failed to rotate invite' });
  }
}

async function getAgency(req, res) {
  try {
    const agency = await agencyService.getAgencyById(req.params.id);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    const agentCount = await agencyService.countAgencyMembers(agency.id);
    res.json({ agency: { ...agency, agentCount } });
  } catch (err) {
    console.error('[Agency] getAgency:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load agency' });
  }
}

async function createAgency(req, res) {
  try {
    const agency = await agencyService.createAgency(req.body || {});
    res.status(201).json({ agency });
  } catch (err) {
    console.error('[Agency] createAgency:', err.message);
    res.status(400).json({ error: err.message || 'Failed to create agency' });
  }
}

async function updateAgency(req, res) {
  try {
    const agency = await agencyService.updateAgency(req.params.id, req.body || {});
    res.json({ agency });
  } catch (err) {
    console.error('[Agency] updateAgency:', err.message);
    const status = err.message === 'Agency not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to update agency' });
  }
}

async function deleteAgency(req, res) {
  try {
    const result = await agencyService.deleteAgency(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[Agency] deleteAgency:', err.message);
    const status = err.message === 'Agency not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to delete agency' });
  }
}

async function listAgencyMembers(req, res) {
  try {
    const agencyId = req.params.id;
    const agency = await agencyService.getAgencyById(agencyId);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });

    const db = getDb();
    const snap = await db.collection('users').where('agencyId', '==', agencyId).get();
    const members = snap.docs.map((doc) => {
      const data = doc.data() || {};
      const firstLast = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
      return {
        uid: doc.id,
        email: data.email || null,
        name:
          data.fullName ||
          data.displayName ||
          data.name ||
          data.agentName ||
          firstLast ||
          null,
        role: getAgencyMembershipRole(data) || data.agencyRole || data.role || 'agency_agent',
        platformRole: data.role || 'agent',
        agencyId,
      };
    });

    const needsAuth = members.filter((m) => !m.name || !m.email);
    if (needsAuth.length && admin) {
      const authByUid = new Map();
      const uids = needsAuth.map((m) => m.uid);
      for (let i = 0; i < uids.length; i += 100) {
        const chunk = uids.slice(i, i + 100);
        // eslint-disable-next-line no-await-in-loop
        const out = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
        out.users.forEach((u) => authByUid.set(u.uid, u));
      }
      members.forEach((m) => {
        const authUser = authByUid.get(m.uid);
        if (!authUser) return;
        m.name = m.name || authUser.displayName || authUser.email || null;
        m.email = m.email || authUser.email || null;
      });
    }

    res.json({ members });
  } catch (err) {
    console.error('[Agency] listAgencyMembers:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list members' });
  }
}

async function assignAgencyMember(req, res) {
  try {
    const agencyId = req.params.id;
    const { uid, uids, role } = req.body || {};
    const idList = Array.isArray(uids) && uids.length
      ? [...new Set(uids.filter(Boolean))]
      : uid
        ? [uid]
        : [];
    if (!idList.length) return res.status(400).json({ error: 'uid or uids is required' });

    const agency = await agencyService.getAgencyById(agencyId);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });

    const assigned = [];
    const errors = [];
    const memberRole = role || 'agency_agent';
    for (const userId of idList) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await agencyService.assignUserToAgency(userId, {
          agencyId,
          role: memberRole,
        });
        assigned.push(result);
      } catch (err) {
        errors.push({ uid: userId, error: err.message || 'Failed to assign' });
      }
    }

    if (!assigned.length) {
      return res.status(400).json({
        error: errors[0]?.error || 'Failed to assign members',
        errors,
      });
    }

    res.json({ success: true, assigned, errors });
  } catch (err) {
    console.error('[Agency] assignAgencyMember:', err.message);
    res.status(400).json({ error: err.message || 'Failed to assign member' });
  }
}

async function updateAgencyMemberRole(req, res) {
  try {
    const { id: agencyId, uid } = req.params;
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ error: 'role is required' });

    const allowedRoles = ['agency_agent', 'agency_admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const db = getDb();
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    if (normalizeAgencyId(snap.data()?.agencyId) !== agencyId) {
      return res.status(400).json({ error: 'User is not in this agency' });
    }

    const result = await agencyService.assignUserToAgency(uid, { agencyId, role });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Agency] updateAgencyMemberRole:', err.message);
    res.status(400).json({ error: err.message || 'Failed to update member role' });
  }
}

async function removeAgencyMember(req, res) {
  try {
    const { id: agencyId, uid } = req.params;
    const db = getDb();
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    if (normalizeAgencyId(snap.data()?.agencyId) !== agencyId) {
      return res.status(400).json({ error: 'User is not in this agency' });
    }
    const data = snap.data() || {};
    const { FieldValue } = admin.firestore;
    const patch = {
      agencyId: null,
      agencyRole: null,
      managedAgents: [],
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!isPlatformRole(data.role)) {
      patch.role = 'agent';
    }
    await ref.set(patch, { merge: true });

    // Kick live pool presence — membership alone is not enough once they are online.
    try {
      const agentManager = require('../services/agentManager');
      await agentManager.removeAgent(uid);
      await socketRegistry.emitToAgent(uid, 'agent:go_live_error', {
        code: 'AGENCY_REMOVED',
        message: 'You were removed from your agency. You have been taken offline.',
      });
    } catch (evictErr) {
      console.warn('[Agency] removeAgencyMember pool eviction failed:', evictErr.message);
    }

    res.json({ success: true, uid });
  } catch (err) {
    console.error('[Agency] removeAgencyMember:', err.message);
    res.status(500).json({ error: err.message || 'Failed to remove member' });
  }
}

async function lockCampaignsForAgency(req, res) {
  try {
    const agencyId = req.params.id;
    const { lockedCampaignIds = [] } = req.body || {};
    if (!Array.isArray(lockedCampaignIds)) {
      return res.status(400).json({ error: 'lockedCampaignIds must be an array' });
    }

    const agency = await agencyService.updateAgency(agencyId, { lockedCampaignIds });

    const db = getDb();
    const { FieldValue } = admin.firestore;
    const pricingRef = db.collection('system').doc('pricing');

    await agencyCampaignService.releaseCampaignsForAgency(agencyId, { lockedCampaignIds: [] });
    const pricingSnap = await pricingRef.get();
    const campaigns = { ...(pricingSnap.data()?.campaigns || {}) };

    lockedCampaignIds.forEach((campaignId) => {
      if (!CAMPAIGN_CONFIG[campaignId] && !campaigns[campaignId]) return;
      const base = campaigns[campaignId] || CAMPAIGN_CONFIG[campaignId] || {};
      campaigns[campaignId] = {
        label: base.label || campaignId,
        buffer: Number(base.buffer) || 0,
        price: Number(base.price) || 0,
        locked: true,
        agencyId,
      };
    });

    await pricingRef.set({ campaigns, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.json({ agency, lockedCampaignIds: agency.lockedCampaignIds });
  } catch (err) {
    console.error('[Agency] lockCampaignsForAgency:', err.message);
    res.status(400).json({ error: err.message || 'Failed to lock campaigns' });
  }
}

async function listAgencyDids(req, res) {
  try {
    const agencyId = req.params.id;
    const routes = await phoneRouteService.listPhoneRoutes();
    res.json({
      routes: routes.filter((r) => normalizeAgencyId(r.agencyId) === agencyId),
    });
  } catch (err) {
    console.error('[Agency] listAgencyDids:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list DIDs' });
  }
}

async function assignAgencyDid(req, res) {
  try {
    const agencyId = req.params.id;
    const { phoneE164, campaignId, label, active = true } = req.body || {};
    const route = await phoneRouteService.createPhoneRoute({
      phoneE164,
      campaignId,
      label,
      active,
      agencyId,
    });
    res.status(201).json({ route });
  } catch (err) {
    console.error('[Agency] assignAgencyDid:', err.message);
    res.status(400).json({ error: err.message || 'Failed to assign DID' });
  }
}

module.exports = {
  listAgencies,
  getAgency,
  createAgency,
  updateAgency,
  deleteAgency,
  listAgencyMembers,
  assignAgencyMember,
  updateAgencyMemberRole,
  removeAgencyMember,
  lockCampaignsForAgency,
  listAgencyDids,
  assignAgencyDid,
  getMyAgents: managerController.getMyAgents,
  getAnalytics: managerController.getAnalytics,
  getAnalyticsDrilldown: managerController.getAnalyticsDrilldown,
  getCallLogs: managerController.getCallLogs,
  getAgencyMe,
  resolveAgencyInvite,
  claimAgencyInvite,
  registerAgency,
  reapplyAgency,
  getAgencyInvite,
  rotateAgencyInvite,
  approveAgency,
  rejectAgency,
  getAdminAgencyInvite,
  rotateAdminAgencyInvite,
};
