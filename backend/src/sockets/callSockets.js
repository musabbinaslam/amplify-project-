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
            const { agentId, campaign } = payload;
            // Use the specific agentId provided by the frontend
            const identity = agentId || socket.id;
            await agentManager.registerAgent(identity, payload);
            
            // Store mapping on socket for cleanup
            socket.agentId = identity;
            
            // Set initial heartbeat TTL (60s)
            await redisClient.setEx(`agent:heartbeat:${identity}`, 60, "alive");
            
            socket.emit('agent:live_confirmed', { status: 'AVAILABLE', identity });
            await broadcastAgentCount(io);
        });

        socket.on('agent:heartbeat', async (payload) => {
            const identity = payload?.agentId || socket.agentId;
            if (identity) {
                // Heartbeat to keep agent alive in the active pool
                await redisClient.setEx(`agent:heartbeat:${identity}`, 60, "alive");
            }
        });

        socket.on('agent:release', async () => {
            if (socket.agentId) {
                await agentManager.releaseAgent(socket.agentId);
                await broadcastAgentCount(io);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.agentId) {
                await agentManager.removeAgent(socket.agentId);
            }
            await broadcastAgentCount(io);
            console.log(`❌ WebRTC Socket Disconnected: ${socket.id}`);
        });
    });
};
