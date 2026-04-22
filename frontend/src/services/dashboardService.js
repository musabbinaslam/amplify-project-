import { apiFetch } from './apiClient';
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
 * Fetch canonical campaign pricing. Public endpoint, no auth required.
 */
export async function fetchCampaignPricing() {
  const url = `${getApiBaseUrl()}/api/public/campaigns`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to load campaigns');
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.campaigns) ? data.campaigns : [];
}
