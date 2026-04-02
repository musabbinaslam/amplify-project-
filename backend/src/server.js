const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const { connectRedis } = require('./config/redis');
const voiceController = require('./controllers/voiceController');
const { setupCallSockets } = require('./sockets/callSockets');
const { verifyFirebaseToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Allow all CORS for local development to prevent origin mismatch issues
app.use(cors());

// Twilio needs x-www-form-urlencoded to hit webhooks!
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
    
    // Twilio Voice Routes (token requires auth, incoming-call is a Twilio webhook)
    app.post('/api/voice/token', verifyFirebaseToken, voiceController.generateToken);
    app.post('/api/voice/incoming-call', voiceController.handleIncomingCall);

    app.get('/health', (req, res) => res.json({ status: 'Engine Active' }));

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
       console.log(`🚀 Node.js Twilio Dialer Interface running flawlessly on port ${PORT}`);
       console.log(`(Loaded latest .env credentials)`);
    });
};

startEngine().catch(err => {
    console.error('Fatal failure booting engine:', err);
});
