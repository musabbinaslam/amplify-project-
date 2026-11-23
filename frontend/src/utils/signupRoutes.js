export const TRACK_TO_PATH = {
  agent: '/signup/agent',
  join: '/signup/join-agency',
  agency: '/signup/start-agency',
};

export const SLUG_TO_TRACK = {
  agent: 'agent',
  'join-agency': 'join',
  'start-agency': 'agency',
  agency: 'agency',
};

export function isCanonicalSignupSlug(slug) {
  return slug === 'agent' || slug === 'join-agency' || slug === 'start-agency';
}

export function resolveTrackFromPathname(pathname = '') {
  const clean = String(pathname || '').replace(/\/+$/, '').toLowerCase();
  if (clean === '/signup/start-agency' || clean === '/signup/agency') {
    return 'agency';
  }
  if (clean === '/signup/join-agency') {
    return 'join';
  }
  return 'agent';
}

export function buildTrackPath(track, search = '') {
  const base = TRACK_TO_PATH[track] || TRACK_TO_PATH.agent;
  if (!search) return base;
  return search.startsWith('?') ? `${base}${search}` : `${base}?${search}`;
}

export function mergeRedirectSearch(existingSearch = '', extraParams = {}) {
  const params = new URLSearchParams(existingSearch || '');
  Object.entries(extraParams || {}).forEach(([key, value]) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      params.set(key, trimmed);
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const UTM_KEYS = [
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
  ['utm_content', 'content'],
  ['utm_term', 'term'],
  ['fbclid', 'fbclid'],
  ['gclid', 'gclid'],
];

export function extractUtmParams(searchParams) {
  if (!searchParams) return null;
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(String(searchParams));
  const out = {};
  let count = 0;
  for (const [paramKey, fieldKey] of UTM_KEYS) {
    const val = String(params.get(paramKey) || '').trim().slice(0, 120);
    if (val) {
      out[fieldKey] = val;
      count += 1;
    }
  }
  return count > 0 ? out : null;
}
