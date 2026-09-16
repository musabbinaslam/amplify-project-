/** Expand env origins to include www and non-www variants (e.g. callsflow.io ↔ www.callsflow.io). */
function expandOrigins(origins) {
  const set = new Set();
  for (const raw of origins) {
    const origin = String(raw || '').trim();
    if (!origin) continue;
    set.add(origin);
    try {
      const url = new URL(origin);
      const host = url.hostname.replace(/^www\./i, '');
      set.add(`${url.protocol}//${host}`);
      set.add(`${url.protocol}//www.${host}`);
    } catch {
      // keep literal origin only
    }
  }
  return [...set];
}

function parseOriginsFromEnv() {
  const raw = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173';
  return expandOrigins(
    raw.split(',').map((o) => o.trim()).filter(Boolean),
  );
}

function isPrivateLanOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (/^10(?:\.\d{1,3}){3}$/.test(hostname)) return true;
    if (/^192\.168(?:\.\d{1,3}){2}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function isOriginAllowed(origin, allowedList) {
  if (!origin) return true;
  if (allowedList.includes(origin)) return true;
  // Local `vite --host` / LAN friend testing. Production still uses CLIENT_URLS.
  if (process.env.NODE_ENV !== 'production' && isPrivateLanOrigin(origin)) return true;
  return false;
}

module.exports = { expandOrigins, parseOriginsFromEnv, isOriginAllowed, isPrivateLanOrigin };
