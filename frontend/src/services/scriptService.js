import { apiFetch } from './apiClient';

export async function loadScriptData(uid, scriptId) {
  void uid;
  const data = await apiFetch('/api/users/me', { method: 'GET' });
  return data?.scriptValues?.[scriptId] || {};
}

export async function saveScriptData(uid, scriptId, values) {
  void uid;
  return apiFetch(`/api/users/me/scripts/${encodeURIComponent(scriptId)}`, {
    method: 'PATCH',
    body: values,
  });
}
