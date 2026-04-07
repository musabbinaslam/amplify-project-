import { apiFetch } from './apiClient';

export function getAdminOverviewLite() {
  return apiFetch('/api/admin/overview-lite', { method: 'GET' });
}

export function getAdminAnalyticsBundle({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/admin/analytics-bundle${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminLiveCalls() {
  return apiFetch('/api/admin/live-calls', { method: 'GET' });
}

export function listAdminDids() {
  return apiFetch('/api/admin/dids', { method: 'GET' });
}

export function createAdminDid(body) {
  return apiFetch('/api/admin/dids', { method: 'POST', body });
}

export function patchAdminDid(id, body) {
  return apiFetch(`/api/admin/dids/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export function deleteAdminDid(id) {
  return apiFetch(`/api/admin/dids/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
