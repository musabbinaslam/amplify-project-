import { apiFetch } from './apiClient';

function buildNotificationQuery(params = {}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.unreadOnly) qs.set('unreadOnly', 'true');
  if (params.scope) qs.set('scope', params.scope);
  return qs.toString();
}

export function getMyNotifications(params = {}) {
  const query = buildNotificationQuery(params);
  return apiFetch(`/api/users/me/notifications${query ? `?${query}` : ''}`, { method: 'GET' });
}

export function getMyAdminNotifications(params = {}) {
  return getMyNotifications({ ...params, scope: 'admin' });
}

export function markNotificationRead(id) {
  return apiFetch(`/api/users/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(params = {}) {
  const query = buildNotificationQuery(params);
  return apiFetch(`/api/users/me/notifications/read-all${query ? `?${query}` : ''}`, { method: 'PATCH' });
}

export function getMaintenanceState() {
  return apiFetch('/api/users/me/maintenance', { method: 'GET' });
}

export function broadcastAdminNotification(body) {
  return apiFetch('/api/admin/notifications/broadcast', { method: 'POST', body });
}

export function getAdminMaintenance() {
  return apiFetch('/api/admin/maintenance', { method: 'GET' });
}

export function patchAdminMaintenance(body) {
  return apiFetch('/api/admin/maintenance', { method: 'PATCH', body });
}
