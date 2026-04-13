import { getApiBaseUrl } from '../config/apiBase';

/**
 * Send conversation history to the backend and return the assistant reply.
 * Requires a Firebase ID token (Support page is authenticated).
 */
export async function sendMessage(messages, getIdToken) {
  const idToken = typeof getIdToken === 'function' ? await getIdToken() : getIdToken;
  if (!idToken) {
    throw new Error('Not signed in');
  }

  const url = `${getApiBaseUrl()}/api/support/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ messages }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      typeof data?.error === 'string' && data.error.trim()
        ? data.error
        : res.status === 401
          ? 'Session expired. Please sign in again.'
          : res.status === 429
            ? 'Too many requests. Please wait a moment and try again.'
            : 'Sorry, something went wrong. Please try again.';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (typeof data.reply !== 'string' || !data.reply.trim()) {
    throw new Error('Invalid response from support service');
  }

  return data.reply.trim();
}
