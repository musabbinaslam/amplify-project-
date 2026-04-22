import { apiFetch } from './apiClient';

/**
 * Records the agent's post-call disposition for a given Twilio CallSid.
 * @param {string} callSid
 * @param {{ disposition: 'sold'|'callback'|'not_interested'|'no_answer', saleAmount?: number, carrier?: string, notes?: string }} payload
 */
export async function setDisposition(callSid, payload) {
  if (!callSid) throw new Error('callSid is required');
  return apiFetch(
    `/api/voice/logs/by-sid/${encodeURIComponent(callSid)}/disposition`,
    { method: 'PATCH', body: payload },
  );
}
