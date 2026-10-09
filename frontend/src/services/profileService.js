import { apiFetch } from './apiClient';

/** Document is resolved from the ID token; `uid` kept for call-site compatibility. */
export async function getProfile(uid) {
  void uid;
  return apiFetch('/api/users/me', { method: 'GET' });
}

export async function getProfileBootstrap(uid) {
  void uid;
  return apiFetch('/api/users/me/bootstrap', { method: 'GET' });
}

export async function saveProfile(uid, data) {
  void uid;
  return apiFetch('/api/users/me', { method: 'PATCH', body: data });
}

export async function sendWelcomeEmail() {
  return apiFetch('/api/users/me/welcome-email', { method: 'POST' });
}

export async function getProfileActivity(limit = 20) {
  const qs = new URLSearchParams({ limit: String(limit) });
  return apiFetch(`/api/users/me/activity?${qs.toString()}`, { method: 'GET' });
}
export async function updateMyCallLogDisposition(callLogId, disposition) {
  return apiFetch(`/api/users/me/call-logs/${callLogId}/disposition`, {
    method: 'PATCH',
    body: { disposition },
  });
}
