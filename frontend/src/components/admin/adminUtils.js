export function getAgentName(row) {
  return row?.agentName || row?.displayName || row?.name || row?.agentId || row?.id || 'Unknown';
}

export function getAgentId(row) {
  return row?.agentId || row?.id || '';
}
