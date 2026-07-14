/**
 * Multi-node Socket.IO room emit verification.
 *
 * Proves that a targeted emit from a process that does NOT hold the client
 * socket still reaches the agent (Redis adapter + agent:{uid} rooms).
 *
 * Prerequisites:
 *   1. REDIS_URL must point at Upstash (or any Redis with pub/sub)
 *   2. Start at least one backend process (two recommended):
 *
 *        REDIS_URL=... PORT=3001 node src/server.js
 *        REDIS_URL=... PORT=3002 node src/server.js
 *
 *   3. Run this script (from backend/):
 *
 *        node scripts/test_multinode_emit.js
 *        # optional:
 *        CONNECT_URL=http://localhost:3001 TEST_UID=multinode-test-user node scripts/test_multinode_emit.js
 *
 * Pass criteria:
 *   - Client on CONNECT_URL receives `test:multinode` emitted via Redis from this process
 *   - emitToAgent returns false for an offline uid (no throw)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const socketRegistry = require('../src/sockets/socketRegistry');

let ioc;
try {
  ioc = require('socket.io-client').io;
} catch {
  console.error('❌ FAIL: socket.io-client is required. Run: npm install socket.io-client');
  process.exit(1);
}

const CONNECT_URL = String(process.env.CONNECT_URL || 'http://localhost:3001').replace(/\/$/, '');
const TEST_UID = String(process.env.TEST_UID || `multinode-test-${Date.now()}`).trim();
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 15000);

function fail(msg) {
  console.error(`❌ FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

async function createEmitterIo() {
  if (!process.env.REDIS_URL) {
    fail('REDIS_URL is required for multi-node emit test');
  }

  const pubClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      tls: process.env.REDIS_URL.startsWith('rediss://'),
    },
  });
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err) => console.error('[test pub]', err.message));
  subClient.on('error', (err) => console.error('[test sub]', err.message));
  await Promise.all([pubClient.connect(), subClient.connect()]);

  const server = http.createServer();
  const io = new Server(server);
  io.adapter(createAdapter(pubClient, subClient));
  socketRegistry.init(io);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  // Allow Redis adapter node discovery before fetchSockets / cross-node emit checks
  await new Promise((r) => setTimeout(r, 1500));
  return { io, server, pubClient, subClient };
}

async function main() {
  console.log(`Bootstrapping Redis emitter first (adapter discovery)...`);
  const emitter = await createEmitterIo();

  console.log(`Connecting client to ${CONNECT_URL} as uid=${TEST_UID}`);

  let client;
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${TIMEOUT_MS}ms waiting for test:multinode`)),
      TIMEOUT_MS,
    );

    client = ioc(CONNECT_URL, {
      transports: ['websocket'],
      forceNew: true,
    });

    client.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Client connect_error: ${err.message}. Is the backend running on ${CONNECT_URL}?`));
    });

    client.on('test:multinode', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  await new Promise((resolve, reject) => {
    if (client.connected) return resolve();
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  console.log(`Client connected: ${client.id}`);
  client.emit('notification:register', { uid: TEST_UID });
  await new Promise((r) => setTimeout(r, 500));

  const payload = { ts: Date.now(), from: 'test_multinode_emit', uid: TEST_UID };
  console.log('Emitting test:multinode via Redis adapter (emitter process)...');
  await socketRegistry.emitToAgent(TEST_UID, 'test:multinode', payload);

  const got = await received;
  if (!got || got.uid !== TEST_UID) {
    fail(`Unexpected payload: ${JSON.stringify(got)}`);
  }
  ok(`Cross-node (Redis-routed) emit received: ${JSON.stringify(got)}`);

  const offline = await socketRegistry.emitToAgent(`offline-${Date.now()}`, 'test:multinode', { ok: false });
  if (offline !== false) {
    fail('emitToAgent for offline agent should return false');
  }
  ok('emitToAgent returns false for offline agent');

  client.disconnect();
  await emitter.pubClient.quit();
  await emitter.subClient.quit();
  emitter.server.close();
  ok('Multi-node socket emit test passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  fail(err.message || String(err));
});
