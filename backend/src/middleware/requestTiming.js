const SAMPLES_PER_ROUTE = 200;
const MAX_ROUTES = 300;
const SLOW_MS = Number(process.env.API_SLOW_MS || 1500);

const routeStats = new Map();

function routeKey(req) {
  const pattern = req.route?.path;
  if (pattern) return `${req.method} ${req.baseUrl || ''}${pattern}`;
  return `${req.method} ${(req.originalUrl || req.url || '').split('?')[0]}`;
}

function record(key, ms, status) {
  let entry = routeStats.get(key);
  if (!entry) {
    if (routeStats.size >= MAX_ROUTES) return;
    entry = { samples: [], count: 0, errors: 0, maxMs: 0 };
    routeStats.set(key, entry);
  }
  entry.count += 1;
  if (status >= 500) entry.errors += 1;
  if (ms > entry.maxMs) entry.maxMs = ms;
  entry.samples.push(ms);
  if (entry.samples.length > SAMPLES_PER_ROUTE) entry.samples.shift();
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function requestTiming(req, res, next) {
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHeadWithTiming(...args) {
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `app;dur=${elapsedMs().toFixed(1)}`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const ms = elapsedMs();
    const key = routeKey(req);
    record(key, ms, res.statusCode);
    if (ms >= SLOW_MS) {
      console.warn(`[slow-api] ${key} ${res.statusCode} ${ms.toFixed(0)}ms`);
    }
  });

  next();
}

function getLatencySnapshot() {
  const rows = [];
  for (const [route, entry] of routeStats) {
    const sorted = [...entry.samples].sort((a, b) => a - b);
    rows.push({
      route,
      count: entry.count,
      errors: entry.errors,
      p50: Math.round(percentile(sorted, 50)),
      p95: Math.round(percentile(sorted, 95)),
      max: Math.round(entry.maxMs),
    });
  }
  rows.sort((a, b) => b.p95 - a.p95);
  return rows;
}

function resetLatencyStats() {
  routeStats.clear();
}

module.exports = { requestTiming, getLatencySnapshot, resetLatencyStats };
