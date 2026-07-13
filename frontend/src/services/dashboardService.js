import { apiFetchWithRetry as apiFetch } from './apiClient';
import { getApiBaseUrl } from '../config/apiBase';

/**
 * Fetch raw call logs for a given date range. Dates are ISO strings.
 */
export async function fetchDashboardLogs({ startDate, endDate, limit = 1000 } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', new Date(startDate).toISOString());
  if (endDate) params.append('endDate', new Date(endDate).toISOString());
  if (limit) params.append('limit', String(limit));
  const qs = params.toString();
  const path = qs ? `/api/voice/logs?${qs}` : '/api/voice/logs';
  const data = await apiFetch(path, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch campaign pricing for the logged-in user (respects agency locked campaigns).
 * Falls back to the public catalog only when the user is not authenticated.
 */
export async function fetchCampaignPricing() {
  try {
    const data = await apiFetch('/api/users/me/campaigns', { method: 'GET' });
    return Array.isArray(data?.campaigns) ? data.campaigns : [];
  } catch (err) {
    // Only use the public (unfiltered) catalog when there is no session.
    // Authenticated agency agents must never see the full default list.
    if (err?.message !== 'Not signed in') {
      throw err;
    }
  }
  const url = `${getApiBaseUrl()}/api/public/campaigns`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to load campaigns');
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.campaigns) ? data.campaigns : [];
}
