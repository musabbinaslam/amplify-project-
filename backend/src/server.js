require('./instrument');
require('../scripts/ensure-release').syncReleaseFile();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const Sentry = require('@sentry/node');

const { connectRedis, redisClient } = require('./config/redis');
const voiceRoutes = require('./routes/voiceRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const supportRoutes = require('./routes/supportRoutes');
const publicRoutes = require('./routes/publicRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const qaRoutes = require('./routes/qaRoutes');
const managerRoutes = require('./routes/managerRoutes');
const agencyRoutes = require('./routes/agencyRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const { setupCallSockets } = require('./sockets/callSockets');
const socketRegistry = require('./sockets/socketRegistry');
const { verifyFirebaseToken } = require('./middleware/auth');
const { globalRateLimiter } = require('./middleware/security');
const { verifyMailer } = require('./config/mailer');

// QA insight runner — in-process async, no Redis queue needed
require('./queues/qaQueue');

const app = express();
const server = http.createServer(app);
// Keep-alive slightly above typical reverse-proxy idle timeouts to avoid ERR_CONNECTION_CLOSED.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Trust reverse proxy headers (required for Hostinger / any proxy-hosted environment)
// Without this, express-rate-limit throws a ValidationError on X-Forwarded-For
app.set('trust proxy', 1);

const { parseOriginsFromEnv, isOriginAllowed } = require('./utils/corsOrigins');

const allowedOrigins = parseOriginsFromEnv();

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

// Twilio sends data as x-www-form-urlencoded, so we must have this!
app.use(cors(corsOptions));

// Stripe / Persona webhooks require the raw body for signature verification.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use('/api/persona/webhook', express.raw({ type: 'application/json' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use(express.json({ limit: '6mb' }));

const io = new Server(server, {
  cors: corsOptions
});

const startEngine = async () => {
  console.log('Starting CallsFlow System...');

  // ── Sync pricing config from Firestore before serving any traffic ─────────
  const { syncPricingConfig } = require('./config/pricing');
  await syncPricingConfig();
  await require('./services/aiFlagsSettings').loadAiFlagsSettings();

  await connectRedis();

  const requireRedisAdapter =
    process.env.REQUIRE_REDIS_ADAPTER === 'true'
    || process.env.NODE_ENV === 'production'
    || Number(process.env.PM2_INSTANCES || process.env.instances || 0) > 1;

  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require('redis');
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pubClient = createClient({
        url: process.env.REDIS_URL,
        socket: {
          tls: process.env.REDIS_URL.startsWith('rediss://'),
        },
      });
      const subClient = pubClient.duplicate();
      pubClient.on('error', (err) => console.error('[Socket.IO Redis pub]', err.message));
      subClient.on('error', (err) => console.error('[Socket.IO Redis sub]', err.message));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.IO Redis adapter enabled');
    } catch (err) {
      if (requireRedisAdapter) {
        console.error('[Socket.IO] Redis adapter required but failed:', err.message);
        throw err;
      }
      console.warn('[Socket.IO] Redis adapter unavailable — single-instance sockets only:', err.message);
    }
  } else if (requireRedisAdapter) {
    throw new Error('REDIS_URL is required for multi-node / production Socket.IO (set REQUIRE_REDIS_ADAPTER=false to override in local single-process mode)');
  }

  socketRegistry.init(io);

  verifyMailer().catch((err) => {
    console.warn('[mailer] verify crashed:', err?.message || err);
  });

  // Init Socket events
  setupCallSockets(io);

  // ── Periodic Ghost Agent Cleanup ──────────────────────────────────────────
  // Agents whose browser crashed / network died stop sending heartbeats.
  // Their heartbeat key (TTL 60s) expires, but they stay in the sorted set
  // until a call comes in to evict them at routing time.
  // This job proactively evicts them every 5 minutes so the agent count
  // stays accurate even during quiet periods with no inbound calls.
  const { CAMPAIGN_CONFIG } = require('./config/pricing');
  const agentManager = require('./services/agentManager');

  async function runGhostCleanup() {
    try {
      // Only one PM2 instance should sweep — Redis NX lock (TTL 4s < 5s interval)
      const lock = await redisClient.set('ghost-cleanup:lock', String(process.pid), {
        NX: true,
        EX: 4,
      });
      if (lock !== 'OK') {
        return;
      }

      const cutoff = Date.now() - 65000; // 65 seconds

      // ── Pass 1: evict agents whose heartbeat sorted-set score is stale ──
      const ghosts = await redisClient.zRangeByScore('agents:heartbeats', 0, cutoff);
      if (ghosts && ghosts.length > 0) {
        for (const agentId of ghosts) {
          await agentManager.removeAgent(agentId);
          console.log(`[Ghost Cleanup] Evicted stale agent: ${agentId}`);
        }
        console.log(`[Ghost Cleanup] ✅ Swept ${ghosts.length} ghost agent(s) from pool`);
      }

      // ── Pass 2: sweep activecalls:data for agents with no heartbeat key ──
      // Catches agents that were IN_CALL when they disconnected and whose
      // heartbeat key has expired but whose call record was never cleaned up.
      const staleCallsEvicted = await agentManager.evictStaleActiveCalls();
      if (staleCallsEvicted > 0) {
        console.log(`[Ghost Cleanup] 🧹 Evicted ${staleCallsEvicted} orphaned active-call record(s)`);
      }

      const staleRingingEvicted = await agentManager.evictStaleRingingAgents();
      if (staleRingingEvicted > 0) {
        console.log(`[Ghost Cleanup] 📵 Released ${staleRingingEvicted} stale RINGING agent(s)`);
      }

      if ((ghosts && ghosts.length > 0) || staleCallsEvicted > 0 || staleRingingEvicted > 0) {
        // Broadcast updated agent count to all connected frontends
        const count = await agentManager.getTotalAvailableCount();
        io.emit('stats:agent_count', count || 0);
      }
    } catch (err) {
      console.error('[Ghost Cleanup] Error during cleanup sweep:', err.message);
    }
  }

  // Run immediately on boot, then every 5 seconds
  runGhostCleanup();
  const ghostCleanupInterval = setInterval(runGhostCleanup, 5 * 1000);

  const { startQaShiftAutoReviewScheduler } = require('./services/qaShiftAutoReviewService');
  const qaShiftInterval = startQaShiftAutoReviewScheduler();

  // Apply global rate limiting to all /api routes
  app.use('/api/', globalRateLimiter);

  // Public: Firebase web config for client Auth SDK (no VITE_FIREBASE_* in frontend)
  app.use('/api/public', publicRoutes);

  // Authenticated user document (Firestore via Admin)
  app.use('/api/users', userRoutes);

  // Admin dashboard (Firebase + Firestore role admin)
  app.use('/api/admin', adminRoutes);

  // QA dashboard (read-only analytics + agent emergency management, role: 'qa' or 'admin')
  app.use('/api/qa', qaRoutes);

  // Manager dashboard (read-only team analytics scoped to managedAgents, role: 'manager' or 'admin')
  app.use('/api/manager', managerRoutes);
  app.use('/api/agency', agencyRoutes);

  // Agent leaderboard (platform agents ranked by billable calls); any authenticated user can view
  app.use('/api/leaderboard', leaderboardRoutes);

  // Mount all voice routes (/token, /incoming-call, /call-completed, /logs)
  app.use('/api/voice', voiceRoutes);

  // Mount webhook routes (/trackdrive)
  app.use('/api/webhooks', webhookRoutes);

  // Mount Persona routes
  const personaRoutes = require('./routes/personaRoutes');
  app.use('/api/persona', personaRoutes);

  // Mount Stripe routes
  const stripeRoutes = require('./routes/stripeRoutes');
  app.use('/api/stripe', stripeRoutes);

  // Mount Referral routes
  const referralRoutes = require('./routes/referralRoutes');
  app.use('/api/referrals', referralRoutes);

  // Support chat (Gemini); requires Firebase ID token
  app.use('/api/support', supportRoutes);

  // Revoke all refresh tokens for the authenticated user
  app.post('/api/auth/revoke', verifyFirebaseToken, async (req, res) => {
    try {
      const admin = require('./config/firebaseAdmin');
      if (!admin) return res.status(503).json({ error: 'Auth service unavailable' });
      await admin.auth().revokeRefreshTokens(req.user.uid);
      res.json({ success: true });
    } catch (err) {
      console.error('[Auth] Failed to revoke tokens:', err.message);
      res.status(500).json({ error: 'Failed to revoke sessions' });
    }
  });

  app.get('/health', async (req, res) => {
    let redis = 'down';
    try {
      const pong = await redisClient.ping();
      if (pong === 'PONG' || pong === 'pong') redis = 'up';
    } catch (err) {
      console.warn('[health] Redis ping failed:', err.message);
    }

    const payload = {
      status: redis === 'up' ? 'ok' : 'degraded',
      redis,
      uptime: Math.round(process.uptime()),
    };

    if (redis === 'down' && process.env.NODE_ENV === 'production') {
      return res.status(503).json(payload);
    }
    return res.json(payload);
  });

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Global Error Catcher
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload too large. Please upload a smaller image.' });
    }
    if (typeof err?.message === 'string' && err.message.startsWith('CORS blocked for origin:')) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }
    console.error('SERVER CRASH PREVENTED:', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🚀 Node.js Twilio Dialer Interface running flawlessly on port ${PORT}`);
    console.log(`(Loaded latest .env credentials)`);
  });

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  // On SIGTERM (PM2 restart, server deploy) or SIGINT (Ctrl+C):
  //   1. Stop accepting new HTTP connections
  //   2. Socket.io disconnects all clients → fires 'disconnect' per socket
  //      → removeAgent() cleans up Redis for each agent
  //   3. Clear the ghost cleanup interval
  //   4. Exit cleanly
  // Force-exit after 10s in case some connections hang
  async function gracefulShutdown(signal) {
    console.log(`\n[Server] ${signal} received — starting graceful shutdown...`);
    clearInterval(ghostCleanupInterval);
    if (qaShiftInterval) clearInterval(qaShiftInterval);

    // Tell all connected frontends the server is restarting
    io.emit('server:restarting', { message: 'Server restarting — you will reconnect automatically.' });

    server.close(() => {
      console.log('[Server] ✅ HTTP server closed. All agents cleaned up via disconnect chain.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Server] ⚠️  Force exit after timeout (some connections did not close cleanly)');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

startEngine().catch(err => {
  console.error('Fatal failure booting engine:', err);
});

// Prevent Redis ECONNRESET or any other unhandled error from crashing the server
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception (server kept alive):', err.message);
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection (server kept alive):', reason);
  if (!process.env.SENTRY_DSN) return;
  if (reason instanceof Error) Sentry.captureException(reason);
  else Sentry.captureMessage(String(reason), 'error');
});
