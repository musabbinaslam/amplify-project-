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

function isOriginAllowed(origin, allowedList) {
  if (!origin) return true;
  return allowedList.includes(origin);
}

module.exports = { expandOrigins, parseOriginsFromEnv, isOriginAllowed };
