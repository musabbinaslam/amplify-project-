export const CTA_LINKS = [
  { value: '/app/billing', label: 'Billing — add credits' },
  { value: '/app/take-calls', label: 'Take calls' },
  { value: '/app/dashboard', label: 'Dashboard' },
  { value: '/app/leaderboard', label: 'Leaderboard' },
  { value: '/app/referral-program', label: 'Referral program' },
  { value: '/app/profile', label: 'Profile' },
  { value: '/app/support-desk', label: 'Support desk' },
];

export const CTA_TEXT_SUGGESTIONS = [
  'Add credits & start closing',
  'Pay now & go live',
  'Top up my wallet',
  'Start taking calls',
  'Go to my dashboard',
  'Claim my spot',
];

export const PREVIEW_NAME = 'Alex Morgan';
export const MAX_STEPS = 6;

export const EMPTY_COPY = {
  subject: '',
  preheader: '',
  eyebrow: 'Medicare inbound',
  headline: '',
  sub: '',
  intro: '',
  body: '',
  cta: 'Add credits & start closing',
  ctaUrl: '/app/billing',
  nextTitle: 'Next steps',
  next: [],
};

export function fillTokens(text, name = PREVIEW_NAME) {
  const first = String(name).split(/\s+/)[0];
  return String(text || '')
    .replace(/\{\{?\s*first_?name\s*\}?\}/gi, first)
    .replace(/\{\{?\s*name\s*\}?\}/gi, name);
}

export function isValidCtaUrl(url) {
  const v = String(url || '').trim();
  return v.startsWith('/') || /^https:\/\/[^\s"'<>]+$/i.test(v);
}

/** Returns what still blocks a send, in the order the fields appear in the email. */
export function validateCopy(copy) {
  const issues = [];
  if (!copy.subject.trim()) issues.push({ field: 'subject', message: 'Add a subject line' });
  if (!copy.headline.trim()) issues.push({ field: 'headline', message: 'Add a headline' });
  if (!copy.intro.trim() && !copy.body.trim()) issues.push({ field: 'intro', message: 'Write your message' });
  if (copy.cta.trim() && !isValidCtaUrl(copy.ctaUrl)) issues.push({ field: 'cta', message: 'Fix the button link' });
  return issues;
}

export function normalizeDraft(raw) {
  const merged = { ...EMPTY_COPY, ...(raw || {}) };
  const next = Array.isArray(merged.next)
    ? merged.next.map((s) => String(s ?? ''))
    : String(merged.next || '').split('\n').filter((s) => s.trim());
  const text = {};
  ['subject', 'preheader', 'eyebrow', 'headline', 'sub', 'intro', 'body', 'cta', 'ctaUrl', 'nextTitle'].forEach((k) => {
    text[k] = String(merged[k] ?? '');
  });
  return { ...text, next: next.slice(0, MAX_STEPS) };
}

export function toPayload(copy) {
  return { ...copy, next: copy.next.map((s) => s.trim()).filter(Boolean) };
}
