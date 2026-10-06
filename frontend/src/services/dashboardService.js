import { apiFetchWithRetry as apiFetch } from './apiClient';
import { getApiBaseUrl } from '../config/apiBase';

/**
 * Server-side aggregates for the Dashboard (metrics, trend baseline, chart, donut, recent calls).
 */
export async function fetchDashboardSummary({ startDate, endDate, prevStartDate, prevEndDate, todayStart } = {}) {
  const params = new URLSearchParams({
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    prevStartDate: new Date(prevStartDate).toISOString(),
    prevEndDate: new Date(prevEndDate).toISOString(),
    todayStart: new Date(todayStart).toISOString(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  return apiFetch(`/api/users/me/dashboard-summary?${params.toString()}`, { method: 'GET' });
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
