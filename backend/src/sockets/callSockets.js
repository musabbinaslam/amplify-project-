const agentManager = require('../services/agentManager');
const { redisClient } = require('../config/redis');

async function broadcastAgentCount(io) {
    try {
       const count = await redisClient.sCard('agents:available');
       io.emit('stats:agent_count', count || 0);
    } catch {
       io.emit('stats:agent_count', 0);
    }
}

exports.setupCallSockets = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 WebRTC Socket Connected: ${socket.id}`);

        socket.on('agent:go_live', async (payload) => {
            await agentManager.registerAgent(socket.id, payload);
            socket.emit('agent:live_confirmed', { status: 'AVAILABLE', socketId: socket.id });
            await broadcastAgentCount(io);
        });

        socket.on('disconnect', async () => {
            await agentManager.removeAgent(socket.id);
            await broadcastAgentCount(io);
            console.log(`❌ WebRTC Socket Disconnected: ${socket.id}`);
        });
    });
};
