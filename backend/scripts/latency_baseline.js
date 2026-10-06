#!/usr/bin/env node
/**
 * Measure p50/p95 latency for the hottest API routes.
 *
 * Usage:
 *   API_BASE=https://api.example.com ID_TOKEN=<firebase id token> node scripts/latency_baseline.js [runs]
 *
 * ID_TOKEN must belong to an admin so admin/QA/manager routes return 200.
 * Copy one from the browser devtools (Authorization header on any /api call).
 */
const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const ID_TOKEN = process.env.ID_TOKEN;
const RUNS = Math.max(1, Number(process.argv[2] || 5));

const ROUTES = [
  '/api/users/me',
  '/api/stripe/wallet',
  '/api/voice/logs',
  '/api/leaderboard',
  '/api/admin/overview-lite',
  '/api/admin/analytics-bundle',
  '/api/admin/agents',
  '/api/admin/users',
  '/api/manager/analytics',
  '/api/qa/reviews',
  '/api/qa/reviews/status',
];

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

async function timeOnce(path) {
  const start = performance.now();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${ID_TOKEN}`, 'Accept-Encoding': 'gzip' },
  });
  const body = await res.arrayBuffer();
  return {
    ms: performance.now() - start,
    status: res.status,
    bytes: body.byteLength,
    server: res.headers.get('server-timing') || '',
  };
}

async function main() {
  if (!ID_TOKEN) {
    console.error('ID_TOKEN is required');
    process.exit(1);
  }
  console.log(`Base: ${API_BASE}  runs/route: ${RUNS}\n`);
  const rows = [];
  for (const route of ROUTES) {
    const samples = [];
    let status = 0;
    let bytes = 0;
    for (let i = 0; i < RUNS; i += 1) {
      try {
        const r = await timeOnce(route);
        samples.push(r.ms);
        status = r.status;
        bytes = r.bytes;
      } catch (err) {
        status = `ERR ${err.message}`;
      }
    }
    samples.sort((a, b) => a - b);
    rows.push({
      route,
      status,
      p50: Math.round(pct(samples, 50)),
      p95: Math.round(pct(samples, 95)),
      kb: Math.round(bytes / 1024),
    });
  }
  console.table(rows);
}

main();
