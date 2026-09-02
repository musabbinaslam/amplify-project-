const { getDb } = require('../config/firestoreDb');
const adminLib = require('../config/firebaseAdmin');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const socketRegistry = require('../sockets/socketRegistry');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const { parseRecordingSid } = require('../utils/recordingSid');

/**
 * GET /api/admin/suspicious-agents
 * Returns all agents currently pending a suspicious-drop review.
 */
async function listSuspiciousAgents(req, res) {
  try {
    const db = getDb();
    const snap = await db
      .collection('users')
      .where('suspiciousReviewPending', '==', true)
      .limit(200)
      .get();

    const agents = await Promise.all(
      snap.docs.map(async (doc) => {
        const data = doc.data() || {};
        const agentId = doc.id;
        const flaggedCallSids = data.suspiciousFlaggedCalls || [];

        // Fetch actual call log documents for the flagged sids
        const callLogsRef = db.collection('users').doc(agentId).collection('callLogs');
        const flaggedLogs = (
          await Promise.all(
            flaggedCallSids.slice(-10).map(async (sid) => {
              try {
                const q = await callLogsRef.where('callSid', '==', sid).limit(1).get();
                if (q.empty) return null;
                const d = q.docs[0].data() || {};
                const recordingSid = parseRecordingSid(d.recordingSid || d.recordingUrl);
                return {
                  id: q.docs[0].id,
                  callSid: d.callSid || sid,
                  from: d.from || '',
                  duration: d.duration || 0,
                  campaign: d.campaign || null,
                  campaignLabel: d.campaignLabel || d.campaign || null,
                  recordingUrl: d.recordingUrl || null,
                  recordingSid: recordingSid || null,
                  timestamp: d.timestamp || null,
                  status: d.status || null,
                  isBillable: d.isBillable === true,
                };
              } catch {
                return null;
              }
            })
          )
        ).filter(Boolean);

        // Count total calls today
        const today = new Date().toISOString().slice(0, 10);
        let todayCallTotal = 0;
        try {
          const todayStart = new Date(`${today}T00:00:00.000Z`);
          const todayEnd = new Date(`${today}T23:59:59.999Z`);
          const todaySnap = await callLogsRef
            .where('timestamp', '>=', todayStart.toISOString())
            .where('timestamp', '<=', todayEnd.toISOString())
            .select()
            .get();
          todayCallTotal = todaySnap.size;
        } catch { /* non-fatal */ }

        return {
          agentId,
          agentName:
            data.displayName ||
            data.fullName ||
            [data.firstName, data.lastName].filter(Boolean).join(' ') ||
            data.email ||
            agentId,
          email: data.email || null,
          suspiciousDropCount: data.suspiciousDropCount || 3,
          suspiciousDropDate: data.suspiciousDropDate || null,
          flaggedLogs,
          todayCallTotal,
        };
      })
    );

    res.json({ agents });
  } catch (err) {
    console.error('[SuspiciousCtrl] listSuspiciousAgents:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list suspicious agents' });
  }
}

/**
 * POST /api/admin/suspicious-agents/:agentId/dismiss
 * Resets strike counter and clears the agent warning banner.
 */
async function dismissSuspiciousAgent(req, res) {
  try {
    const { agentId } = req.params;
    if (!agentId) return res.status(400).json({ error: 'agentId required' });

    const db = getDb();
    await db.collection('users').doc(agentId).set(
      {
        suspiciousDropCount: 0,
        suspiciousDropDate: null,
        suspiciousFlaggedCalls: [],
        suspiciousReviewPending: false,
        suspiciousWarningActive: false,
      },
      { merge: true }
    );

    await socketRegistry.emitToAgent(agentId, 'agent:suspicious_warning_cleared', {
      message: 'Your suspicious pattern warning has been reviewed and dismissed by an admin.',
    });

    await notificationService.notifyAgent(agentId, {
      type: 'personal',
      title: 'Warning Dismissed',
      body: 'The admin has reviewed your account and dismissed the suspicious pattern warning.',
      priority: 'normal',
    });

    console.log(`[SuspiciousCtrl] Dismissed warning for agent ${agentId} by admin ${req.user?.uid}`);
    res.json({ success: true, agentId, action: 'dismissed' });
  } catch (err) {
    console.error('[SuspiciousCtrl] dismissSuspiciousAgent:', err.message);
    res.status(500).json({ error: err.message || 'Failed to dismiss warning' });
  }
}

/**
 * POST /api/admin/suspicious-agents/:agentId/force-charge
 * Charges the agent for 1 call at the campaign rate and clears review state.
 */
async function forceChargeSuspiciousAgent(req, res) {
  try {
    const { agentId } = req.params;
    const { campaignId } = req.body;
    if (!agentId) return res.status(400).json({ error: 'agentId required' });

    const db = getDb();
    const userSnap = await db.collection('users').doc(agentId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'Agent not found' });

    const data = userSnap.data() || {};
    let chargeConfig = null;
    let effectiveCampaignId = campaignId;

    if (effectiveCampaignId && CAMPAIGN_CONFIG[effectiveCampaignId]) {
      chargeConfig = CAMPAIGN_CONFIG[effectiveCampaignId];
    } else {
      // Infer campaign from the last flagged call
      const flaggedSids = data.suspiciousFlaggedCalls || [];
      if (flaggedSids.length > 0) {
        try {
          const q = await db
            .collection('users').doc(agentId).collection('callLogs')
            .where('callSid', '==', flaggedSids[flaggedSids.length - 1])
            .limit(1).get();
          if (!q.empty) {
            const logData = q.docs[0].data() || {};
            effectiveCampaignId = logData.campaign;
            chargeConfig = CAMPAIGN_CONFIG[effectiveCampaignId] || null;
          }
        } catch { /* non-fatal */ }
      }
    }

    if (!chargeConfig || !chargeConfig.price) {
      return res.status(400).json({ error: 'Could not determine campaign price. Pass campaignId in the request body.' });
    }

    const chargeCents = Math.round(chargeConfig.price * 100);

    // Check if the agent has enough balance before deducting
    const currentBalance = await walletService.getBalance(agentId);
    if (currentBalance < chargeCents) {
      const shortfallCents = chargeCents - currentBalance;
      return res.json({
        success: false,
        insufficientBalance: true,
        agentId,
        chargeCents,
        currentBalanceCents: currentBalance,
        shortfallCents,
        campaignId: effectiveCampaignId,
        campaignLabel: chargeConfig.label || effectiveCampaignId,
      });
    }

    await walletService.deductCredits(agentId, chargeCents, {
      campaignId: effectiveCampaignId,
      campaignLabel: chargeConfig.label || effectiveCampaignId,
      reason: 'force_charge_suspicious_drop',
      adminId: req.user?.uid || 'admin',
    });

    await db.collection('users').doc(agentId).set(
      {
        suspiciousDropCount: 0,
        suspiciousDropDate: null,
        suspiciousFlaggedCalls: [],
        suspiciousReviewPending: false,
        suspiciousWarningActive: false,
      },
      { merge: true }
    );

    await socketRegistry.emitToAgent(agentId, 'agent:suspicious_warning_cleared', {
      message: 'A penalty charge has been applied to your wallet for suspicious call drop behavior.',
    });

    const campaignLabel = chargeConfig.label || effectiveCampaignId || 'Unknown';
    await notificationService.notifyAgent(agentId, {
      type: 'personal',
      title: 'Penalty Charge Applied',
      body: `An admin has applied a penalty charge of $${chargeConfig.price.toFixed(2)} (1x ${campaignLabel}) for repeated near-buffer call drops.`,
      priority: 'high',
    });

    console.log(`[SuspiciousCtrl] Force charged agent ${agentId} $${chargeConfig.price} by admin ${req.user?.uid}`);
    res.json({ success: true, agentId, action: 'force_charged', amountCents: chargeCents, campaignId: effectiveCampaignId });
  } catch (err) {
    console.error('[SuspiciousCtrl] forceChargeSuspiciousAgent:', err.message);
    res.status(500).json({ error: err.message || 'Failed to force charge agent' });
  }
}

module.exports = {
  listSuspiciousAgents,
  dismissSuspiciousAgent,
  forceChargeSuspiciousAgent,
};
