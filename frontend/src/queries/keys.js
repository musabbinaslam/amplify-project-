export const queryKeys = {
  wallet: ['wallet'],
  campaignPricing: ['campaignPricing'],
  callLogsRoot: ['callLogs'],
  callLogs: (params) => ['callLogs', params],
  dashboardSummary: (period) => ['callLogs', 'dashboardSummary', period],
  leaderboard: (params) => ['leaderboard', params],
  adminOverviewLite: ['admin', 'overviewLite'],
  adminAnalyticsBundle: (params) => ['admin', 'analyticsBundle', params],
};
