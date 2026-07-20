import { apiFetch } from './apiClient';

export function getAdminOverviewLite() {
  return apiFetch('/api/admin/overview-lite', { method: 'GET' });
}

export function listAdminUsersLite() {
  return apiFetch('/api/admin/users/all-lite', { method: 'GET' });
}

export function getAdminAnalyticsBundle({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) qs.set('tz', tz); } catch { /* noop */ }
  return apiFetch(`/api/admin/analytics-bundle${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function listAdminAgentsDirectory({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return apiFetch(`/api/admin/agents${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminAnalyticsDrilldown({ type, id, from, to } = {}) {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  if (id) qs.set('id', id);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) qs.set('tz', tz); } catch { /* noop */ }
  return apiFetch(`/api/admin/analytics-drilldown${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminLiveCalls() {
  return apiFetch('/api/admin/live-calls', { method: 'GET' });
}

export function getAdminAiCoachingOverview(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/admin/ai-training/coaching-overview${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminAiAgentPlans(params = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.risk) qs.set('risk', params.risk);
  if (params.search) qs.set('search', params.search);
  return apiFetch(`/api/admin/ai-training/agent-plans${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function listAdminDids() {
  return apiFetch('/api/admin/dids', { method: 'GET' });
}

export function listAdminAgencies() {
  return apiFetch('/api/admin/agencies', { method: 'GET' });
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

export function postAdminBroadcastNotification(body) {
  return apiFetch('/api/admin/notifications/broadcast', { method: 'POST', body });
}

export function postAdminTargetedNotification(body) {
  return apiFetch('/api/admin/notifications/targeted', { method: 'POST', body });
}

export function listAdminBroadcasts({ limit = 50, cursor } = {}) {
  const qs = new URLSearchParams();
  if (limit) qs.set('limit', String(limit));
  if (cursor) qs.set('cursor', cursor);
  return apiFetch(`/api/admin/notifications/broadcasts${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAdminBroadcast(id) {
  return apiFetch(`/api/admin/notifications/broadcasts/${encodeURIComponent(id)}`, { method: 'GET' });
}

export function patchAdminBroadcast(id, body) {
  return apiFetch(`/api/admin/notifications/broadcasts/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export function deleteAdminBroadcast(id) {
  return apiFetch(`/api/admin/notifications/broadcasts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getAdminMaintenanceState() {
  return apiFetch('/api/admin/maintenance', { method: 'GET' });
}

export function patchAdminMaintenanceState(body) {
  return apiFetch('/api/admin/maintenance', { method: 'PATCH', body });
}

export function getAdminCampaignControls() {
  return apiFetch('/api/admin/campaign-controls', { method: 'GET' });
}

export function patchAdminCampaignControl(campaignId, body) {
  return apiFetch(`/api/admin/campaign-controls/${encodeURIComponent(campaignId)}`, { method: 'PATCH', body });
}

export function forceRemoveAgent(agentId) {
  return apiFetch(`/api/admin/agents/${encodeURIComponent(agentId)}/force-remove`, { method: 'POST' });
}

export function listAdminUsers() {
  return apiFetch('/api/admin/users', { method: 'GET' });
}

export function patchManagerSettings(uid, { role, managedAgents, teamName }) {
  const body = { role, managedAgents };
  if (teamName !== undefined) body.teamName = teamName;
  return apiFetch(`/api/admin/users/${encodeURIComponent(uid)}/manager-settings`, {
    method: 'PATCH',
    body,
  });
}

export function listAdminManagers(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/admin/managers${suffix}`, { method: 'GET' });
}

export function getAdminManager(uid, params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/admin/managers/${encodeURIComponent(uid)}${suffix}`, { method: 'GET' });
}

export function flagAdminAgent(agentId, reason) {
  return apiFetch(`/api/admin/agents/${encodeURIComponent(agentId)}/flag`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function resumeAdminAgent(agentId) {
  return apiFetch(`/api/admin/agents/${encodeURIComponent(agentId)}/resume`, { method: 'POST' });
}

export function listAdminCallContests(status = 'pending', limit = 50) {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (limit) qs.set('limit', String(limit));
  return apiFetch(`/api/admin/call-contests?${qs.toString()}`, { method: 'GET' });
}

export function getAdminCallContest(contestId) {
  return apiFetch(`/api/admin/call-contests/${encodeURIComponent(contestId)}`, { method: 'GET' });
}

export function approveAdminCallContest(contestId, reason) {
  return apiFetch(`/api/admin/call-contests/${encodeURIComponent(contestId)}/approve`, {
    method: 'POST',
    body: { reason },
  });
}

export function denyAdminCallContest(contestId, adminNote) {
  return apiFetch(`/api/admin/call-contests/${encodeURIComponent(contestId)}/deny`, {
    method: 'POST',
    body: { adminNote },
  });
}

export function refundAdminCall({ agentId, callLogId, reason }) {
  return apiFetch('/api/admin/call-logs/refund', {
    method: 'POST',
    body: { agentId, callLogId, reason },
  });
}

export function upsertAdminCampaign({ id, label, buffer, price }) {
  return apiFetch('/api/admin/campaigns', {
    method: 'POST',
    body: { id, label, buffer, price },
  });
}

export function deleteAdminCampaign(campaignId) {
  return apiFetch(`/api/admin/campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'DELETE',
  });
}

