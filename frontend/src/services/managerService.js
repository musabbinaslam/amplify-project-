import { apiFetch } from './apiClient';

function managerQueryParams({ managerUid, from, to, agentId, limit } = {}) {
  const qs = new URLSearchParams();
  if (managerUid) qs.set('managerUid', managerUid);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (agentId) qs.set('agentId', agentId);
  if (limit) qs.set('limit', String(limit));
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) qs.set('tz', tz);
  } catch { /* non-critical — falls back to UTC on backend */ }
  return qs;
}

export function getManagerAgents({ managerUid } = {}) {
  const qs = managerQueryParams({ managerUid });
  return apiFetch(`/api/manager/my-agents${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
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

export function getManagerAnalytics({ managerUid, from, to } = {}) {
  const qs = managerQueryParams({ managerUid, from, to });
  return apiFetch(`/api/manager/analytics${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getManagerCallLogs({ managerUid, from, to, agentId, limit } = {}) {
  const qs = managerQueryParams({ managerUid, from, to, agentId, limit });
  return apiFetch(`/api/manager/call-logs${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getManagerAnalyticsDrilldown({ managerUid, from, to, agentId } = {}) {
  const qs = managerQueryParams({ managerUid, from, to, agentId });
  return apiFetch(`/api/manager/analytics-drilldown${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}
