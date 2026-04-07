import { apiFetch } from './apiClient';

export function getAdminOverview() {
  return apiFetch('/api/admin/overview', { method: 'GET' });
}

export function getAdminCallStats({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/admin/call-stats${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminCampaignCallStats({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/admin/call-stats/campaigns${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminAgentCallStats({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/admin/call-stats/agents${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminLiveCalls() {
  return apiFetch('/api/admin/live-calls', { method: 'GET' });
}

export function getAdminAgents() {
  return apiFetch('/api/admin/agents', { method: 'GET' });
}

export function getAdminCampaigns() {
  return apiFetch('/api/admin/campaigns', { method: 'GET' });
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
