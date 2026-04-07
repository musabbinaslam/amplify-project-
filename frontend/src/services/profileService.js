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

export async function getOrCreateApiKey(uid) {
  void uid;
  const data = await apiFetch('/api/users/me/api-key', { method: 'POST' });
  if (typeof data?.apiKey !== 'string') {
    throw new Error('Invalid API key response');
  }
  return data.apiKey;
}

export async function regenerateApiKey() {
  return apiFetch('/api/users/me/api-key/regenerate', { method: 'POST' });
}

export async function checkSlugAvailability(slug) {
  const qs = new URLSearchParams({ slug: String(slug || '').trim().toLowerCase() });
  return apiFetch(`/api/users/me/slug-availability?${qs.toString()}`, { method: 'GET' });
}

export async function getProfileActivity(limit = 20) {
  const qs = new URLSearchParams({ limit: String(limit) });
  return apiFetch(`/api/users/me/activity?${qs.toString()}`, { method: 'GET' });
}
