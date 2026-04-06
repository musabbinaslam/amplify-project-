const { AGENTCALLS_KNOWLEDGE } = require('../support/knowledgeBase');

const MOCK_RESPONSES = [
  {
    keywords: ['billing', 'charge', 'payment', 'invoice', 'cost', 'price', 'plan', 'subscription'],
    response:
      'For billing questions, you can view your current plan and invoices in the **Billing** tab. If you need to update your payment method or have a charge dispute, please email billing@agentcalls.io and we\'ll get back to you within 24 hours.',
  },
  {
    keywords: ['call', 'phone', 'dial', 'inbound', 'outbound', 'ring', 'voip'],
    response:
      'To start taking calls, head to the **Take Calls** tab and make sure your status is set to Online. Incoming calls will ring directly in your browser. Make sure you\'ve allowed microphone permissions when prompted.',
  },
  {
    keywords: ['script', 'prompt', 'talk', 'say'],
    response:
      'You can customize your call script in the **Script** tab. This is what guides your conversations with leads. We recommend keeping it concise and updating it as you learn what works best for your verticals.',
  },
  {
    keywords: ['lead', 'leads', 'prospect', 'contact'],
    response:
      'The **Leads** tab shows all your captured leads. You can filter by date, status, and source. Leads are automatically captured when someone books through your landing page or completes a call.',
  },
  {
    keywords: ['profile', 'avatar', 'bio', 'landing page', 'url'],
    response:
      'You can update your profile photo, bio, and landing page URL in the **Profile** tab. Your landing page is public and can be shared with potential leads.',
  },
  {
    keywords: ['setup', 'start', 'begin', 'how to', 'getting started', 'new'],
    response:
      'Welcome! Here\'s how to get started:\n\n1. Complete your **Profile** with a photo and bio\n2. Set up your **Script** for handling calls\n3. Select your **Licensed States**\n4. Go to **Take Calls** and set your status to Online\n\nYou\'ll start receiving calls once everything is configured.',
  },
  {
    keywords: ['state', 'license', 'licensed'],
    response:
      'You can manage which states you\'re licensed to operate in from the **Licensed States** tab. Make sure to keep this updated — you\'ll only receive calls from states you\'ve selected.',
  },
  {
    keywords: ['webhook', 'api', 'integration', 'key'],
    response:
      'Your API key and webhook URL are available in the **Profile** tab under "Integration & Links". Use the webhook URL to receive lead notifications in your CRM, and include the API key in the `X-Agent-Key` header for authentication.',
  },
];

const FALLBACK =
  "I'm not sure I have the answer to that right now. Could you try rephrasing your question? For complex issues, you can also reach our team at support@agentcalls.io.";

const MAX_HISTORY_MESSAGES = 24;

const SYSTEM_INSTRUCTION = `You are the AgentCalls in-app support assistant. You help licensed insurance agents use the AgentCalls web portal only.

Use the knowledge below for factual details. If something is not in the knowledge, say you are not sure and suggest Email Support on the Support page or support@agentcalls.io.

Behavior:
- Answer only about AgentCalls, this product, its tabs/features, and how to use the app.
- Refuse general trivia, unrelated products, coding help, or off-topic chat. Reply briefly that you only help with AgentCalls and point to Email Support for other needs.
- Be concise. Use **bold** for main tab names when helpful.
- Do not give legal, medical, or binding regulatory advice; suggest checking with compliance or carrier materials.
- Never claim to speak officially for insurance carriers or guarantee outcomes.

Knowledge base:
${AGENTCALLS_KNOWLEDGE}
`;

function trimHistory(messages) {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function toGeminiContents(messages) {
  let list = trimHistory(messages);
  if (list[0]?.role === 'assistant') {
    list = list.slice(1);
  }
  return list
    .filter((m) => m.text != null && String(m.text).trim())
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(m.text) }],
    }));
}

function getGeminiText(data) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text === 'string' && text.trim()) return text.trim();
  const reason = data?.candidates?.[0]?.finishReason;
  if (reason && reason !== 'STOP') {
    return 'I could not generate a full reply. Please try again or use Email Support for help.';
  }
  return FALLBACK;
}

async function sendMockMessage(messages) {
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) return FALLBACK;

  const text = lastUserMsg.text.toLowerCase();
  const match = MOCK_RESPONSES.find((entry) =>
    entry.keywords.some((kw) => text.includes(kw)),
  );
  return match?.response || FALLBACK;
}

async function sendGeminiMessage(messages) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const contents = toGeminiContents(messages);
  if (contents.length === 0) {
    return FALLBACK;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || 'Request failed';
    const err = new Error(
      res.status === 429
        ? 'Too many requests. Please wait a moment and try again.'
        : res.status === 400 || res.status === 403
          ? 'AI support is misconfigured or the API key is invalid. Set GEMINI_API_KEY and GEMINI_MODEL in the backend .env.'
          : msg,
    );
    err.code = data?.error?.status || `http_${res.status}`;
    throw err;
  }

  return getGeminiText(data);
}

/**
 * @param {Array<{ role: string, text: string }>} messages
 * @returns {Promise<string>}
 */
async function generateSupportReply(messages) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return sendMockMessage(messages);
  }

  return sendGeminiMessage(messages);
}

module.exports = { generateSupportReply };
