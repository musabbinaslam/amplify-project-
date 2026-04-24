const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const { connectRedis } = require('./config/redis');
const voiceRoutes = require('./routes/voiceRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const supportRoutes = require('./routes/supportRoutes');
const publicRoutes = require('./routes/publicRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { setupCallSockets } = require('./sockets/callSockets');
const { verifyFirebaseToken } = require('./middleware/auth');
const { globalRateLimiter } = require('./middleware/security');
const { verifyMailer } = require('./config/mailer');

// QA insight runner — in-process async, no Redis queue needed
require('./queues/qaQueue');

const app = express();
const server = http.createServer(app);

// Trust reverse proxy headers (required for Hostinger / any proxy-hosted environment)
// Without this, express-rate-limit throws a ValidationError on X-Forwarded-For
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser tools (curl/postman) that send no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

// Twilio sends data as x-www-form-urlencoded, so we must have this!
app.use(cors(corsOptions));

// Stripe webhook requires raw body for signature verification
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use(express.json({ limit: '6mb' }));

const io = new Server(server, {
  cors: corsOptions
});

const startEngine = async () => {
    console.log('Starting CallsFlow System...');
    await connectRedis();

    verifyMailer().catch((err) => {
        console.warn('[mailer] verify crashed:', err?.message || err);
    });

    // Init Socket events
    setupCallSockets(io);

    // ── Periodic Ghost Agent Cleanup ──────────────────────────────────────────
    // Agents whose browser crashed / network died stop sending heartbeats.
    // Their heartbeat key (TTL 60s) expires, but they stay in the sorted set
    // until a call comes in to evict them at routing time.
    // This job proactively evicts them every 2 minutes so the agent count
    // stays accurate even during quiet periods with no inbound calls.
    const { CAMPAIGN_CONFIG } = require('./config/pricing');
    const agentManager = require('./services/agentManager');
    const { redisClient } = require('./config/redis');

    async function runGhostCleanup() {
        try {
            let evicted = 0;
            for (const campaignId of Object.keys(CAMPAIGN_CONFIG)) {
                const poolKey = `pool:${campaignId}`;
                const candidates = await redisClient.zRange(poolKey, 0, -1);
                for (const agentId of candidates) {
                    const isAlive = await redisClient.exists(`agent:heartbeat:${agentId}`);
                    if (!isAlive) {
                        await redisClient.zRem(poolKey, agentId);
                        await redisClient.del(`agent:${agentId}`);
                        evicted++;
                        console.log(`[Ghost Cleanup] Evicted stale agent: ${agentId} from campaign: ${campaignId}`);
                    }
                }
            }
            if (evicted > 0) {
                console.log(`[Ghost Cleanup] ✅ Swept ${evicted} ghost agent(s) from pool`);
                // Broadcast updated count to all connected frontends
                const count = await agentManager.getTotalAvailableCount();
                io.emit('stats:agent_count', count || 0);
            }
        } catch (err) {
            console.error('[Ghost Cleanup] Error during cleanup sweep:', err.message);
        }
    }

    // Run immediately on boot, then every 2 minutes
    runGhostCleanup();
    const ghostCleanupInterval = setInterval(runGhostCleanup, 2 * 60 * 1000);

    // Apply global rate limiting to all /api routes
    app.use('/api/', globalRateLimiter);

    // Public: Firebase web config for client Auth SDK (no VITE_FIREBASE_* in frontend)
    app.use('/api/public', publicRoutes);

    // Authenticated user document (Firestore via Admin)
    app.use('/api/users', userRoutes);

    // Admin dashboard (Firebase + Firestore role admin)
    app.use('/api/admin', adminRoutes);
    
    // Mount all voice routes (/token, /incoming-call, /call-completed, /logs)
    app.use('/api/voice', voiceRoutes);

    // Mount webhook routes (/trackdrive)
    app.use('/api/webhooks', webhookRoutes);

    // Mount Stripe routes
    const stripeRoutes = require('./routes/stripeRoutes');
    app.use('/api/stripe', stripeRoutes);

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

    app.get('/health', (req, res) => res.json({ status: 'Engine Active' }));

    // Global Error Catcher
    app.use((err, req, res, next) => {
        if (err?.type === 'entity.too.large') {
          return res.status(413).json({ error: 'Payload too large. Please upload a smaller image.' });
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
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
};

startEngine().catch(err => {
    console.error('Fatal failure booting engine:', err);
});

// Prevent Redis ECONNRESET or any other unhandled error from crashing the server
process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Process] Unhandled Rejection (server kept alive):', reason);
});
