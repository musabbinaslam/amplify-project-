import { apiFetch } from './apiClient';

export function getMyNotifications(params = {}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.unreadOnly) qs.set('unreadOnly', 'true');
  return apiFetch(`/api/users/me/notifications${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function markNotificationRead(id) {
  return apiFetch(`/api/users/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return apiFetch('/api/users/me/notifications/read-all', { method: 'PATCH' });
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
