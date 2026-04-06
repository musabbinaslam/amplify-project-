const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const { connectRedis } = require('./config/redis');
const voiceRoutes = require('./routes/voiceRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const supportRoutes = require('./routes/supportRoutes');
const { setupCallSockets } = require('./sockets/callSockets');
const { verifyFirebaseToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Twilio sends data as x-www-form-urlencoded, so we must have this!
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const startEngine = async () => {
    console.log('Starting AgentCalls System...');
    await connectRedis();

    // Init Socket events
    setupCallSockets(io);
    
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
        console.error('SERVER CRASH PREVENTED:', err.stack);
        res.status(500).send('Internal Server Error');
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
