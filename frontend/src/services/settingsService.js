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
  // Legacy caller arg (SettingsPage store token). Token comes from apiFetch → currentUser.
  void token;
  try {
    await apiFetch('/api/auth/revoke', { method: 'POST' });
  } catch (err) {
    if (err?.message === 'Request failed') {
      const mapped = new Error('Failed to revoke sessions');
      if (err.status) mapped.status = err.status;
      throw mapped;
    }
    throw err;
  }
}
