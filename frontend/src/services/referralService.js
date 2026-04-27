import { apiFetch } from './apiClient';

/**
 * Frontend API client for referral program endpoints.
 */
export const referralService = {
  /** Get the authenticated user's referral dashboard. */
  getMyDashboard: () => apiFetch('/api/referrals/me'),

  /** Resolve a referral code (public, no auth needed — uses fetch directly). */
  resolveCode: async (code) => {
    const baseUrl = (import.meta.env.VITE_API_URL || '').trim();
    const apiUrl = baseUrl
      ? (/^https?:\/\//i.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : `https://${baseUrl}`.replace(/\/+$/, ''))
      : 'http://localhost:3001';
    const res = await fetch(`${apiUrl}/api/referrals/resolve/${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error('Failed to resolve referral code');
    return res.json();
  },

  /** Claim a referral code for the authenticated user (post-signup). */
  claimCode: (code) => apiFetch('/api/referrals/claim', { method: 'POST', body: { code } }),

  /** Get the current discount status for the authenticated user. */
  getDiscountStatus: () => apiFetch('/api/referrals/discount/status'),

  /** Get the leaderboard. */
  getLeaderboard: (limit = 10) => apiFetch(`/api/referrals/leaderboard?limit=${limit}`),
};
