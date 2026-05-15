import { apiFetch } from './apiClient';

export function getQaOverviewLite() {
  return apiFetch('/api/qa/overview-lite', { method: 'GET' });
}

export function getQaAnalyticsBundle({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/qa/analytics-bundle${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getQaAnalyticsDrilldown({ type, id, from, to } = {}) {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  if (id) qs.set('id', id);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/qa/analytics-drilldown${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getQaLiveCalls() {
  return apiFetch('/api/qa/live-calls', { method: 'GET' });
}

export function getQaAiCoachingOverview(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/qa/ai-training/coaching-overview${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getQaAiAgentPlans(params = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.risk) qs.set('risk', params.risk);
  if (params.search) qs.set('search', params.search);
  return apiFetch(`/api/qa/ai-training/agent-plans${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function qaForceRemoveAgent(agentId) {
  return apiFetch(`/api/qa/agents/${encodeURIComponent(agentId)}/force-remove`, { method: 'POST' });
}
