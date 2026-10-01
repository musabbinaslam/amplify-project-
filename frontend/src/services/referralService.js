import { apiFetch } from './apiClient';

/**
 * Frontend API client for referral program endpoints.
 */
export const referralService = {
  /** Get the authenticated user's referral dashboard. */
  getMyDashboard: () => apiFetch('/api/referrals/me'),

  /** Claim a referral code for the authenticated user (post-signup). */
  claimCode: (code) => apiFetch('/api/referrals/claim', { method: 'POST', body: { code } }),

  /** Get the current discount status for the authenticated user. */
  getDiscountStatus: () => apiFetch('/api/referrals/discount/status'),

  /** Get the leaderboard. */
  getLeaderboard: (limit = 10) => apiFetch(`/api/referrals/leaderboard?limit=${limit}`),
};
