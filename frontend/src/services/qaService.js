import { apiFetch } from './apiClient';

export function getQaSummary(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/users/me/qa/summary${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getQaTrend(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.limit) qs.set('limit', String(params.limit));
  return apiFetch(`/api/users/me/qa/trend${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getQaScorecards(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.limit) qs.set('limit', String(params.limit));
  return apiFetch(`/api/users/me/qa/scorecards${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getQaPatterns(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/users/me/qa/patterns${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

