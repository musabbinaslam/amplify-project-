const { generateSupportReply } = require('../services/supportChatService');

function validateMessages(body) {
  const { messages } = body;
  if (!Array.isArray(messages)) return { error: 'messages must be an array' };
  for (const m of messages) {
    if (!m || typeof m !== 'object') return { error: 'each message must be an object' };
    if (m.role !== 'user' && m.role !== 'assistant') {
      return { error: 'message.role must be user or assistant' };
    }
    if (m.text != null && typeof m.text !== 'string') {
      return { error: 'message.text must be a string when present' };
    }
  }
  return { messages };
}

async function postSupportChat(req, res) {
  const parsed = validateMessages(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const reply = await generateSupportReply(parsed.messages);
    res.json({ reply });
  } catch (err) {
    console.error('[SupportChat]', err.message);
    const status =
      err.code === 'RESOURCE_EXHAUSTED' || String(err.message).includes('Too many') ? 429 : 502;
    res.status(status).json({
      error: err.message || 'Support chat failed',
    });
  }
}

module.exports = { postSupportChat };
