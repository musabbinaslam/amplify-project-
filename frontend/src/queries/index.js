import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../services/apiClient';
import { stripeService } from '../services/stripeService';
import { fetchCampaignPricing } from '../services/dashboardService';
import { queryKeys } from './keys';

export { queryKeys };

export function useWalletQuery({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => stripeService.getWallet(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled,
  });
}

export function useCampaignPricingQuery({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.campaignPricing,
    queryFn: fetchCampaignPricing,
    staleTime: 5 * 60_000,
    enabled,
  });
}

function logsPath({ limit, startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return qs ? `/api/voice/logs?${qs}` : '/api/voice/logs';
}

/**
 * The signed-in user's call logs. `params` must be serialisable; it is part of the cache key.
 */
export function useCallLogsQuery(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.callLogs(params),
    queryFn: async () => {
      const data = await apiFetch(logsPath(params));
      return Array.isArray(data) ? data : [];
    },
    placeholderData: keepPreviousData,
    ...options,
  });
}
