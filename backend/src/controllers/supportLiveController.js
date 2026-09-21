const supportConversationService = require('../services/supportConversationService');
const { getUserDoc } = require('../services/userDataService');
const supportSockets = require('../sockets/supportSockets');
const supportChatMedia = require('../services/supportChatMedia');

async function actorFromReq(req) {
  const fetched = await getUserDoc(req.user.uid);
  return {
    uid: req.user.uid,
    email: req.user.email || fetched?.email,
    name: fetched?.displayName || fetched?.name || fetched?.fullName || req.user.name,
    role: fetched?.role || 'agent',
  };
}

function sendErr(res, err, fallback) {
  const status = err.status || (err.message === 'Invalid date range' ? 400 : 500);
  console.error('[SupportLive]', err.message);
  return res.status(status).json({ error: err.message || fallback });
}

async function getMyConversation(req, res) {
  try {
    const actor = await actorFromReq(req);
    const out = await supportConversationService.getOrCreateMine(actor, {
      timeZone: req.query?.tz,
    });
    res.json(out);
  } catch (err) {
    sendErr(res, err, 'Failed to load conversation');
  }
}

async function getMessages(req, res) {
  try {
    const actor = await actorFromReq(req);
    const markReadFlag = String(req.query.markRead || '') === '1' || req.query.markRead === 'true';
    const out = await supportConversationService.getMessages(req.params.id, actor, {
      cursor: req.query.cursor,
      limit: req.query.limit,
      markRead: markReadFlag,
    });
    if (out.readChanged) {
      supportSockets.broadcastConversation(out.conversation, 'support:read');
    }
    res.json(out);
  } catch (err) {
    sendErr(res, err, 'Failed to load messages');
  }
}

async function postMessage(req, res) {
  try {
    const actor = await actorFromReq(req);
    const out = await supportConversationService.postMessage(
      req.params.id,
      actor,
      req.body?.text,
      { replyTo: req.body?.replyTo, attachments: req.body?.attachments },
    );
    supportSockets.broadcastMessage(out.conversation, out.message);
    res.json(out);
  } catch (err) {
    sendErr(res, err, 'Failed to send message');
  }
}

async function markRead(req, res) {
  try {
    const actor = await actorFromReq(req);
    const out = await supportConversationService.markRead(req.params.id, actor);
    if (out.changed) {
      supportSockets.broadcastConversation(out.conversation, 'support:read');
    }
    res.json({ conversation: out.conversation, changed: out.changed });
  } catch (err) {
    sendErr(res, err, 'Failed to mark read');
  }
}

async function uploadMedia(req, res) {
  try {
    const actor = await actorFromReq(req);
    const convo = await supportConversationService.getConversation(req.params.id);
    await supportConversationService.assertUserCanAccess(convo, actor.uid, actor.role);
    const media = await supportChatMedia.saveMedia(req.params.id, req.file, {
      durationMs: req.body?.durationMs,
    });
    res.json({ media });
  } catch (err) {
    sendErr(res, err, 'Failed to upload file');
  }
}

async function getMedia(req, res) {
  try {
    const actor = await actorFromReq(req);
    const convo = await supportConversationService.getConversation(req.params.id);
    await supportConversationService.assertUserCanAccess(convo, actor.uid, actor.role);
    const payload = await supportChatMedia.readMediaBuffer(req.params.id, req.params.mediaId, {
      variant: req.query.variant,
    });
    supportChatMedia.sendMediaResponse(req, res, payload);
  } catch (err) {
    sendErr(res, err, 'Failed to load file');
  }
}

module.exports = {
  getMyConversation,
  getMessages,
  postMessage,
  markRead,
  uploadMedia,
  getMedia,
};
