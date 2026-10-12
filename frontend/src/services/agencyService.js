import { apiFetch } from './apiClient';
import { getApiBaseUrl } from '../config/apiBase';

function agencyQueryParams({ agencyId, from, to, agentId, limit } = {}) {
  const qs = new URLSearchParams();
  if (agencyId) qs.set('agencyId', agencyId);
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

export function getAgencyAgents({ agencyId } = {}) {
  const qs = agencyQueryParams({ agencyId });
  return apiFetch(`/api/agency/agents${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAgencyAnalytics({ agencyId, from, to } = {}) {
  const qs = agencyQueryParams({ agencyId, from, to });
  return apiFetch(`/api/agency/analytics${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAgencyCallLogs({ agencyId, from, to, agentId, limit } = {}) {
  const qs = agencyQueryParams({ agencyId, from, to, agentId, limit });
  return apiFetch(`/api/agency/call-logs${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAgencyAnalyticsDrilldown({ agencyId, from, to, agentId } = {}) {
  const qs = agencyQueryParams({ agencyId, from, to, agentId });
  return apiFetch(`/api/agency/analytics-drilldown${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAgencyMe({ agencyId } = {}) {
  const qs = agencyQueryParams({ agencyId });
  return apiFetch(`/api/agency/me${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function listAdminAgencies() {
  return apiFetch('/api/admin/agencies', { method: 'GET' });
}

export function createAdminAgency(body) {
  return apiFetch('/api/admin/agencies', { method: 'POST', body });
}

export function updateAdminAgency(id, body) {
  return apiFetch(`/api/admin/agencies/${id}`, { method: 'PATCH', body });
}

export function deleteAdminAgency(id) {
  return apiFetch(`/api/admin/agencies/${id}`, { method: 'DELETE' });
}

export function listAgencyMembers(agencyId) {
  return apiFetch(`/api/admin/agencies/${agencyId}/members`, { method: 'GET' });
}

export function assignAgencyMember(agencyId, body) {
  return apiFetch(`/api/admin/agencies/${agencyId}/members`, { method: 'POST', body });
}

export function updateAgencyMemberRole(agencyId, uid, body) {
  return apiFetch(`/api/admin/agencies/${agencyId}/members/${uid}`, {
    method: 'PATCH',
    body,
  });
}

export function removeAgencyMember(agencyId, uid) {
  return apiFetch(`/api/admin/agencies/${agencyId}/members/${uid}`, { method: 'DELETE' });
}

export function lockAgencyCampaigns(agencyId, lockedCampaignIds) {
  return apiFetch(`/api/admin/agencies/${agencyId}/lock-campaigns`, {
    method: 'POST',
    body: { lockedCampaignIds },
  });
}

export function listAgencyDids(agencyId) {
  return apiFetch(`/api/admin/agencies/${agencyId}/dids`, { method: 'GET' });
}

export function assignAgencyDid(agencyId, body) {
  return apiFetch(`/api/admin/agencies/${agencyId}/dids`, { method: 'POST', body });
}

/** Public resolve — no auth required. */
export async function resolveAgencyInvite(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) throw new Error('Invite code is required');
  const url = `${getApiBaseUrl()}/api/public/agency-invites/${encodeURIComponent(normalized)}`;
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || 'Invite code not found');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function claimAgencyInvite(code) {
  return apiFetch('/api/agency-invites/claim', {
    method: 'POST',
    body: { code: String(code || '').trim().toUpperCase() },
  });
}

export function registerAgencyApplication(body) {
  return apiFetch('/api/agency/register', { method: 'POST', body });
}

/** Clear rejected founder membership so they can register a new agency. */
export function reapplyAgencyApplication() {
  return apiFetch('/api/agency/reapply', { method: 'POST', body: {} });
}

export function getAgencyInvite({ agencyId } = {}) {
  const qs = agencyQueryParams({ agencyId });
  return apiFetch(`/api/agency/invite${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function rotateAgencyInvite({ agencyId } = {}) {
  const qs = agencyQueryParams({ agencyId });
  return apiFetch(`/api/agency/invite/rotate${qs.toString() ? `?${qs.toString()}` : ''}`, {
    method: 'POST',
    body: {},
  });
}

export function getAdminAgencyInvite(agencyId) {
  return apiFetch(`/api/admin/agencies/${agencyId}/invite`, { method: 'GET' });
}

export function rotateAdminAgencyInvite(agencyId) {
  return apiFetch(`/api/admin/agencies/${agencyId}/invite/rotate`, { method: 'POST', body: {} });
}

export function approveAdminAgency(agencyId) {
  return apiFetch(`/api/admin/agencies/${agencyId}/approve`, { method: 'POST', body: {} });
}

export function rejectAdminAgency(agencyId, reason) {
  return apiFetch(`/api/admin/agencies/${agencyId}/reject`, {
    method: 'POST',
    body: { reason: reason || '' },
  });
}
