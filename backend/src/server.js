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

// Auto-start queues on boot
require('./queues/qaQueue');

const app = express();
const server = http.createServer(app);

// Twilio sends data as x-www-form-urlencoded, so we must have this!
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use(express.json({ limit: '6mb' }));

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST']
  }
});

const startEngine = async () => {
    console.log('Starting AgentCalls System...');
    await connectRedis();

    // Init Socket events
    setupCallSockets(io);

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
