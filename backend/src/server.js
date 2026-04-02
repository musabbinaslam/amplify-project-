const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const { connectRedis } = require('./config/redis');
const voiceRoutes = require('./routes/voiceRoutes');
const { setupCallSockets } = require('./sockets/callSockets');

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
