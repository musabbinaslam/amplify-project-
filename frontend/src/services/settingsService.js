import { apiFetch } from './apiClient';

export async function loadSettings(uid) {
  void uid;
  const data = await apiFetch('/api/users/me', { method: 'GET' });
  return data?.settings || {};
}

export async function saveSettings(uid, partial) {
  void uid;
  const data = await apiFetch('/api/users/me/settings', {
    method: 'PATCH',
    body: partial,
  });
  return data?.settings || {};
}

export async function exportUserData(uid) {
  const data = await apiFetch('/api/users/me', { method: 'GET' });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `callsflow-data-${uid}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function revokeAllSessions(token) {
  const res = await fetch(
    `${(import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/auth/revoke`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to revoke sessions');
  }
}
