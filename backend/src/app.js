const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

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
  console.log(`Agent connected: ${socket.id}`);

  socket.on('agent:go_live', (data) => {
    console.log(`Agent went live:`, data);
    // Broadcast status update
  });

  socket.on('disconnect', () => {
    console.log(`Agent disconnected: ${socket.id}`);
  });
});

// Basic Route
app.get('/', (req, res) => {
  res.json({ message: 'AgentCalls API is running' });
});

// Mount API Routes
const voiceRoutes = require('./routes/voiceRoutes');
app.use('/api/voice', voiceRoutes);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
