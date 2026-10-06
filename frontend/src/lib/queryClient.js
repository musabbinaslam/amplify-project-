import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../queries/keys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
    },
  },
});

let boundUid;

/** Drop every cached response when the signed-in user changes so data never leaks across accounts. */
export function bindQueryCacheToAuth(authStore) {
  boundUid = authStore.getState().user?.uid ?? null;
  return authStore.subscribe((state) => {
    const uid = state.user?.uid ?? null;
    if (uid === boundUid) return;
    boundUid = uid;
    queryClient.clear();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('wallet_updated', (e) => {
    const balance = e?.detail;
    if (balance !== undefined && balance !== null) {
      queryClient.setQueryData(queryKeys.wallet, (prev) => (prev ? { ...prev, balance } : prev));
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
  });
  window.addEventListener('contest:resolved', () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.callLogsRoot });
  });
}
