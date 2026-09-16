export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function validateTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return null;
  const trimmed = tz.trim();
  if (trimmed.length < 3 || trimmed.length > 64) return null;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    return null;
  }
}

export function resolveChatTimeZone(stored) {
  return validateTimeZone(stored) || 'UTC';
}

function dayKeyInTz(isoLike, timeZone) {
  const d = isoLike instanceof Date ? isoLike : new Date(isoLike || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const tz = resolveChatTimeZone(timeZone);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function shiftDayKey(yyyyMmDd, deltaDays) {
  const [year, month, day] = String(yyyyMmDd).split('-').map(Number);
  if (!year || !month || !day) return '';
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDayKeys(fromKey, toKey) {
  const [y1, m1, d1] = String(fromKey).split('-').map(Number);
  const [y2, m2, d2] = String(toKey).split('-').map(Number);
  if (!y1 || !y2) return 0;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function formatChatDayLabel(isoLike, timeZone) {
  const tz = resolveChatTimeZone(timeZone);
  const key = dayKeyInTz(isoLike, tz);
  if (!key) return '';
  const today = dayKeyInTz(Date.now(), tz);
  if (key === today) return 'Today';
  if (key === shiftDayKey(today, -1)) return 'Yesterday';
  const age = diffDayKeys(key, today);
  const d = isoLike instanceof Date ? isoLike : new Date(isoLike);
  if (age > 0 && age < 7) {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d);
  }
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);
}

export function formatChatTime(isoLike, timeZone) {
  const d = isoLike instanceof Date ? isoLike : new Date(isoLike);
  if (Number.isNaN(d.getTime())) return '';
  const tz = resolveChatTimeZone(timeZone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function withDaySeparators(messages = [], timeZone) {
  const tz = resolveChatTimeZone(timeZone);
  const items = [];
  let lastKey = '';
  messages.forEach((msg) => {
    const key = dayKeyInTz(msg?.createdAt, tz);
    if (key && key !== lastKey) {
      items.push({
        type: 'day',
        id: `day-${key}`,
        label: formatChatDayLabel(msg.createdAt, tz),
      });
      lastKey = key;
    }
    items.push({ type: 'msg', msg });
  });
  return items;
}
