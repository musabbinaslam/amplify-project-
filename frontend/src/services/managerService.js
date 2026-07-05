import { apiFetch } from './apiClient';

export function getManagerAgents() {
  return apiFetch('/api/manager/my-agents', { method: 'GET' });
}

export function listManagerAssignableAgents() {
  return apiFetch('/api/manager/assignable-agents', { method: 'GET' });
}

export function updateManagerTeam({ managedAgents }) {
  return apiFetch('/api/manager/team', {
    method: 'PATCH',
    body: { managedAgents },
  });
}

export function getManagerAnalytics({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/manager/analytics${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getManagerCallLogs({ from, to, agentId, limit } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (agentId) qs.set('agentId', agentId);
  if (limit) qs.set('limit', String(limit));
  return apiFetch(`/api/manager/call-logs${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getManagerAnalyticsDrilldown({ from, to, agentId } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (agentId) qs.set('agentId', agentId);
  return apiFetch(`/api/manager/analytics-drilldown${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}
