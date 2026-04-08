const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const agentManager = require('./services/agentManager');

const app = express();
const server = http.createServer(app);

// Move socket initialization to a separate module in production apps
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO
io.on('connection', (socket) => {
  console.log(`[Socket] 🔗 Connection: ${socket.id}`);

  socket.on('agent:go_live', async (data) => {
    const { agentId } = data;
    if (!agentId) return;

    // Attach agentId to the socket for cleanup on disconnect
    socket.agentId = agentId;
    
    await agentManager.registerAgent(agentId, data);
    console.log(`[Socket] 🟢 Agent Go Live: ${agentId} (${socket.id})`);
  });

  socket.on('agent:release', async () => {
    if (socket.agentId) {
      await agentManager.releaseAgent(socket.agentId);
      console.log(`[Socket] 🟡 Agent Released: ${socket.agentId}`);
    }
  });

  socket.on('disconnect', async () => {
    if (socket.agentId) {
      await agentManager.removeAgent(socket.agentId);
      console.log(`[Socket] 🔴 Agent Offline: ${socket.agentId} (Disconnected)`);
    } else {
      console.log(`[Socket] ⚪ Anonymous Disconnected: ${socket.id}`);
    }
  });
});

// Basic Route
app.get('/', (req, res) => {
  res.json({ message: 'CallsFlow API is running' });
});

// Mount API Routes
const voiceRoutes = require('./routes/voiceRoutes');
app.use('/api/voice', voiceRoutes);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
