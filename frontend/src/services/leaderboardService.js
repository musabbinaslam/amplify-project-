import { apiFetchWithRetry as apiFetch } from './apiClient';

/**
 * Fetch the platform-agent leaderboard.
 * @param {object} opts
 * @param {'today'|'week'|'month'|'all'} [opts.period='month']
 * @param {string} [opts.tz] IANA timezone (defaults to the browser's)
 * @returns {Promise<{ period: string, window: {from: string, to: string}, totalAgents: number, entries: Array, me: object|null, generatedAt: string }>}
 */
export async function fetchLeaderboard({ period = 'month', tz } = {}) {
  const resolvedTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const params = new URLSearchParams();
  params.append('period', period);
  params.append('tz', resolvedTz);
  const data = await apiFetch(`/api/leaderboard?${params.toString()}`, { method: 'GET' });
  return {
    period: data?.period || period,
    window: data?.window || null,
    totalAgents: data?.totalAgents || 0,
    entries: Array.isArray(data?.entries) ? data.entries : [],
    me: data?.me || null,
    generatedAt: data?.generatedAt || null,
  };
}
