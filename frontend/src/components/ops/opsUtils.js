export const RANGE_LABELS = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' };
export const LOW_BILLABLE_THRESHOLD = 0.3;
export const PERF_PAGE_SIZE = 10;
export const LOG_PAGE_SIZE = 15;

const CAMPAIGN_SHORT = {
  fe_tv_calls: 'FE TV',
  medicare_transfers: 'Medicare',
  aca_transfers: 'ACA',
  medicare_inbound_1: 'Medicare Inbound',
};

function looksLikeUid(value) {
  const s = String(value || '').trim();
  return s.length >= 20 && !s.includes('@') && !s.includes(' ');
}

export function formatAgentDisplayName(agent) {
  const raw = agent?.agentName || agent?.name || agent?.id || 'Unknown';
  if (looksLikeUid(raw)) {
    return { label: 'Unnamed agent', title: raw };
  }
  return { label: raw, title: raw };
}

export function getAgentLiveSubtext(agent, liveCall) {
  if (!agent?.online) return null;
  if (liveCall) {
    const secs = Number(liveCall.durationSec || 0);
    return secs > 0 ? `On call · ${secs}s` : 'On call';
  }
  if (agent.campaignId) {
    return CAMPAIGN_SHORT[agent.campaignId] || agent.campaignId;
  }
  return 'Ready — no active call';
}

export function statusMeta(status, online, classes) {
  if (!online) return { label: 'Offline', cls: classes.statOffline };
  switch (status) {
    case 'AVAILABLE': return { label: 'Listening', cls: classes.statAvailable };
    case 'RINGING': return { label: 'Ringing', cls: classes.statRinging };
    case 'IN_CALL': return { label: 'On Call', cls: classes.statInCall };
    case 'WRAP_UP': return { label: 'Wrapping Up', cls: classes.statInCall };
    default: return { label: status || 'Online', cls: classes.statAvailable };
  }
}
