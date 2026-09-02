const agentManager = require('./agentManager');
const socketRegistry = require('../sockets/socketRegistry');
const { mergeUserDoc, getUserDoc } = require('./userDataService');
const { notifyAgent } = require('./notificationService');

async function flagAgentAccount(agentId, {
  reason,
  flaggedBy = 'admin',
  message,
  notificationBody,
} = {}) {
  const id = String(agentId || '').trim();
  if (!id) {
    throw Object.assign(new Error('agentId is required'), { code: 'AGENT_REQUIRED' });
  }

  const existing = await getUserDoc(id);
  const alreadyFlagged = existing?.flagged === true;
  const flagReason = String(reason || 'Account flagged').trim();

  await mergeUserDoc(id, {
    flagged: true,
    flaggedAt: new Date().toISOString(),
    flaggedBy: flaggedBy || 'admin',
    flagReason,
  });

  await agentManager.removeAgent(id);

  if (!alreadyFlagged) {
    await socketRegistry.emitToAgent(id, 'agent:flagged', {
      reason: flagReason,
      message: message
        || 'Your account has been flagged. Please contact admin@callsflow.io to resume your activity.',
    });
    await notifyAgent(id, {
      type: 'personal',
      title: 'Account Flagged',
      body: notificationBody || `Your account was flagged: ${flagReason}`,
      priority: 'high',
    });
  }

  return { agentId: id, alreadyFlagged, flagged: true, flagReason };
}

module.exports = { flagAgentAccount };
