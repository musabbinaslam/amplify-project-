export const queryKeys = {
  wallet: ['wallet'],
  campaignPricing: ['campaignPricing'],
  callLogsRoot: ['callLogs'],
  callLogs: (params) => ['callLogs', params],
  dashboardLogs: (period) => ['callLogs', 'dashboard', period],
  dashboardSummary: (period) => ['dashboardSummary', period],
  leaderboard: (params) => ['leaderboard', params],
  adminOverviewLite: ['admin', 'overviewLite'],
  adminAnalyticsBundle: (params) => ['admin', 'analyticsBundle', params],
};
