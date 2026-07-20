/**
 * Socket.IO scale smoke test — connect N clients, register for notifications,
 * send heartbeats for a duration. Does NOT open Twilio Devices (media stays off-VPS).
 *
 * Usage (from backend/):
 *   node scripts/load_test_sockets.js --url http://localhost:3001 --clients 500 --duration 120
 *   node scripts/load_test_sockets.js --url https://api.callsflow.io --clients 1000 --duration 120
 *
 * Pass criteria (see deploy/OPS_RUNBOOK.md):
 *   - High connect success (≥99% target)
 *   - Low unexpected disconnect rate during the hold window
 *   - Watch pm2 / Hostinger CPU+RAM / Upstash while running
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

let ioc;
try {
  ioc = require('socket.io-client').io;
} catch {
  console.error('socket.io-client is required. Run: npm install --save-dev socket.io-client');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    url: 'http://localhost:3001',
    clients: 500,
    duration: 120,
    heartbeatMs: 10000,
    rampMs: 5,
  };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const val = args[i + 1];
    if (key === '--url') out.url = String(val || out.url).replace(/\/$/, '');
    if (key === '--clients') out.clients = Math.max(1, Number(val) || out.clients);
    if (key === '--duration') out.duration = Math.max(1, Number(val) || out.duration);
    if (key === '--heartbeat-ms') out.heartbeatMs = Math.max(1000, Number(val) || out.heartbeatMs);
    if (key === '--ramp-ms') out.rampMs = Math.max(0, Number(val) || out.rampMs);
  }
  return out;
}

function pct(n, d) {
  if (!d) return '0.0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function main() {
  const { url, clients, duration, heartbeatMs, rampMs } = parseArgs();
  console.log(`Load test sockets → ${url}`);
  console.log(`clients=${clients} duration=${duration}s heartbeat=${heartbeatMs}ms ramp=${rampMs}ms`);

  const sockets = [];
  let connected = 0;
  let connectFailed = 0;
  let disconnects = 0;
  let heartbeatsSent = 0;

  const connectOne = (index) => new Promise((resolve) => {
    const uid = `loadtest-${index}-${Date.now()}`;
    const socket = ioc(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 15000,
    });

    const timer = setTimeout(() => {
      connectFailed += 1;
      try { socket.disconnect(); } catch (_) { /* ignore */ }
      resolve(null);
    }, 20000);

    socket.on('connect', () => {
      clearTimeout(timer);
      connected += 1;
      socket.emit('notification:register', { uid });
      socket._loadUid = uid;
      socket._hb = setInterval(() => {
        if (socket.connected) {
          socket.emit('agent:heartbeat', { agentId: uid, sessionId: `load-${uid}` });
          heartbeatsSent += 1;
        }
      }, heartbeatMs);
      sockets.push(socket);
      resolve(socket);
    });

    socket.on('connect_error', () => {
      clearTimeout(timer);
      connectFailed += 1;
      try { socket.disconnect(); } catch (_) { /* ignore */ }
      resolve(null);
    });

    socket.on('disconnect', () => {
      disconnects += 1;
    });
  });

  const rampStart = Date.now();
  for (let i = 0; i < clients; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await connectOne(i);
    if (rampMs > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, rampMs));
    }
    if ((i + 1) % 100 === 0 || i + 1 === clients) {
      console.log(`  ramped ${i + 1}/${clients} (connected=${connected}, failed=${connectFailed})`);
    }
  }
  const rampElapsed = ((Date.now() - rampStart) / 1000).toFixed(1);
  console.log(`Ramp done in ${rampElapsed}s — holding for ${duration}s...`);

  const disconnectsAtHoldStart = disconnects;
  await new Promise((r) => setTimeout(r, duration * 1000));
  const holdDisconnects = disconnects - disconnectsAtHoldStart;

  for (const socket of sockets) {
    if (socket._hb) clearInterval(socket._hb);
    try { socket.disconnect(); } catch (_) { /* ignore */ }
  }

  console.log('\n── Results ──');
  console.log(`Target clients:     ${clients}`);
  console.log(`Connected:          ${connected} (${pct(connected, clients)})`);
  console.log(`Connect failed:     ${connectFailed} (${pct(connectFailed, clients)})`);
  console.log(`Disconnects total:  ${disconnects}`);
  console.log(`Disconnects in hold:${holdDisconnects}`);
  console.log(`Heartbeats sent:    ${heartbeatsSent}`);
  console.log(`Hold duration:      ${duration}s`);

  const connectOk = connected / clients >= 0.99;
  const holdOk = holdDisconnects / Math.max(connected, 1) <= 0.05;
  if (connectOk && holdOk) {
    console.log('\n✅ Pass heuristic: ≥99% connect and ≤5% disconnect during hold');
    process.exit(0);
  }
  console.log('\n⚠️  Review metrics — did not meet ≥99% connect / ≤5% hold-disconnect heuristic');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
