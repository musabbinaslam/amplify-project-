const agentManager = require('../services/agentManager');
const { redisClient } = require('../config/redis');
const { getBalance } = require('../services/walletService');
const socketRegistry = require('./socketRegistry');


async function broadcastAgentCount(io) {
    try {
       const count = await agentManager.getTotalAvailableCount();
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

            // ── Balance Gate ─────────────────────────────────────────────────
            // Agent must have credits > $0 to enter the live pool.
            // Once live, if balance hits $0 mid-call the call continues uninterrupted
            // (billing is deducted after call completion, not during).
            try {
                const balanceCents = await getBalance(identity);
                if (balanceCents <= 0) {
                    console.log(`[Wallet] 🚫 Agent ${identity} blocked from going live — zero balance ($${(balanceCents / 100).toFixed(2)})`);
                    socket.emit('agent:go_live_error', {
                        code: 'INSUFFICIENT_BALANCE',
                        message: 'Your wallet balance is $0.00. Please add credits to your account before going live.',
                        balance: balanceCents,
                    });
                    return; // Do NOT register — agent stays out of the pool
                }
            } catch (err) {
                // If the balance check itself fails (e.g. Firebase unavailable),
                // allow through rather than blocking a legitimate agent on a service error.
                console.error(`[Wallet] Balance check failed for ${identity} during go_live — allowing through:`, err.message);
            }

            await agentManager.registerAgent(identity, payload);
            
            // Store mapping on socket for cleanup
            socket.agentId = identity;
            
            // Register in socket registry so post-webhook code can target this agent
            socketRegistry.register(identity, socket);
            
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

        // Explicit go-offline (agent clicks "Go Offline" without closing the browser)
        // Removes them from the pool immediately rather than waiting for disconnect/heartbeat expiry
        socket.on('agent:go_offline', async () => {
            if (socket.agentId) {
                socketRegistry.unregister(socket.agentId);
                await agentManager.removeAgent(socket.agentId);
                socket.agentId = null;
                await broadcastAgentCount(io);
                console.log(`[Socket] Agent went offline explicitly`);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.agentId) {
                socketRegistry.unregister(socket.agentId);
                await agentManager.removeAgent(socket.agentId);
            }
            await broadcastAgentCount(io);
            console.log(`❌ WebRTC Socket Disconnected: ${socket.id}`);
        });
    });
};
