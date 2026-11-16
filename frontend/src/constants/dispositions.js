/**
 * Canonical call-disposition vocabulary.
 * Modal picker ids + labels are the source of truth. `sold` is a display-only
 * fallback (not a picker option). Label strings must stay identical to
 * backend/src/controllers/dashboardSummaryController.js DISPOSITION_LABELS
 * so summary.dispositions buckets match the dashboard donut keys.
 */

export const DISPOSITIONS = [
  { id: 'not_interested', label: 'Not Interested', tone: 'negative' },
  { id: 'does_not_qualify', label: "Doesn't Qualify", tone: 'negative' },
  { id: 'over_age', label: 'Over Age', tone: 'negative' },
  { id: 'thinks_its_free', label: "Thinks It's Free", tone: 'negative' },
  { id: 'call_dropped', label: 'Call Dropped', tone: 'negative' },
  { id: 'callback', label: 'Call Back', tone: 'callback' },
  { id: 'busy', label: 'Busy', tone: 'negative' },
  { id: 'dead_air', label: 'Dead Air', tone: 'negative' },
  { id: 'policy_closed', label: 'Policy Closed', tone: 'policy', isSpecial: true },
];

export const SOLD_FALLBACK = { id: 'sold', label: 'Sold', tone: 'sold' };

export const DISPOSITION_LABELS = Object.fromEntries([
  ...DISPOSITIONS.map((d) => [d.id, d.label]),
  [SOLD_FALLBACK.id, SOLD_FALLBACK.label],
]);

const DISPOSITION_BY_ID = {
  ...Object.fromEntries(DISPOSITIONS.map((d) => [d.id, d])),
  [SOLD_FALLBACK.id]: SOLD_FALLBACK,
};

const TONE_DONUT_COLOR = {
  sold: 'var(--brand-text)',
  policy: 'var(--brand-text)',
  callback: 'var(--accent-yellow)',
  negative: 'var(--accent-red)',
};

/** Donut keys: every picker id + sold fallback + derived Answered/Missed/No Answer. */
export const DONUT_SEGMENTS = [
  { key: SOLD_FALLBACK.label, color: TONE_DONUT_COLOR.sold },
  ...DISPOSITIONS.map((d) => ({ key: d.label, color: TONE_DONUT_COLOR[d.tone] })),
  { key: 'Answered', color: 'var(--accent-cyan)' },
  { key: 'No Answer', color: 'var(--text-tertiary)' },
  { key: 'Missed', color: 'var(--accent-red)' },
];

/** Lookup by stored id only (QA column). Returns null when unknown. */
export function getDispositionOption(id) {
  return (id && DISPOSITION_BY_ID[id]) || null;
}

/**
 * Badge metadata for a log. Known ids win; `sold` / isBillable is the
 * display fallback. Returns null when the log has no disposition to show.
 */
export function getDispositionMeta(log) {
  const mapped = getDispositionOption(log?.disposition);
  if (mapped) return mapped;
  if (log?.isBillable) return SOLD_FALLBACK;
  return null;
}

/**
 * Dashboard / summary bucket label. Matches backend dispositionLabel:
 * known id (incl. sold) → that label; else isBillable → Sold; else
 * missed / completed / No Answer.
 */
export function getDisposition(log) {
  if (log?.disposition && DISPOSITION_LABELS[log.disposition]) {
    return DISPOSITION_LABELS[log.disposition];
  }
  if (log?.isBillable) return SOLD_FALLBACK.label;
  if (log?.status === 'missed') return 'Missed';
  if (log?.status === 'completed' && Number(log?.duration) > 0) return 'Answered';
  return 'No Answer';
}
