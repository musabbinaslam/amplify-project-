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

/**
 * Send a message and get a bot response.
 *
 * To connect a real AI provider, replace the mock block below with a fetch
 * to your API. The function signature stays the same — it receives the full
 * conversation history and returns the assistant's reply as a string.
 *
 * Example (Gemini):
 *   const res = await fetch(
 *     `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${import.meta.env.VITE_AI_API_KEY}`,
 *     { method: 'POST', headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ contents: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })) }) }
 *   );
 *   const data = await res.json();
 *   return data.candidates[0].content.parts[0].text;
 */
export async function sendMessage(messages) {
  // --- SWAP THIS BLOCK FOR REAL AI ---
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) return FALLBACK;

  const text = lastUserMsg.text.toLowerCase();
  const match = MOCK_RESPONSES.find((entry) =>
    entry.keywords.some((kw) => text.includes(kw)),
  );
  return match?.response || FALLBACK;
  // --- END MOCK BLOCK ---
}
