const agentManager = require('../services/agentManager');
const { redisClient } = require('../config/redis');
const { getBalance } = require('../services/walletService');
const socketRegistry = require('./socketRegistry');

const HEARTBEAT_TTL_SECONDS = 120;

async function broadcastAgentCount(io) {
    if (typeof io.__lastAgentCount === 'undefined') io.__lastAgentCount = null;
    try {
       const count = await agentManager.getTotalAvailableCount();
       if (io.__lastAgentCount === count) return;
       io.__lastAgentCount = count;
       io.emit('stats:agent_count', count || 0);
    } catch {
       if (io.__lastAgentCount === 0) return;
       io.__lastAgentCount = 0;
       io.emit('stats:agent_count', 0);
    }
}

exports.setupCallSockets = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 WebRTC Socket Connected: ${socket.id}`);

        socket.on('notification:register', (payload = {}) => {
            const uid = String(payload.uid || '').trim();
            if (!uid) return;
            socket.notificationUid = uid;
            socketRegistry.register(uid, socket);
        });

        socket.on('notification:unregister', () => {
            if (!socket.notificationUid) return;
            socketRegistry.unregister(socket.notificationUid, socket);
            socket.notificationUid = null;
        });

        socket.on('agent:go_live', async (payload) => {
            const { agentId, campaign, sessionId } = payload;
            // Use the specific agentId provided by the frontend
            const identity = agentId || socket.id;
            const safeSessionId = String(sessionId || `${identity}-${Date.now()}`).trim();

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

            const registered = await agentManager.registerAgent(identity, {
                ...payload,
                sessionId: safeSessionId,
            });
            
            // Store mapping on socket for cleanup
            socket.agentId = identity;
            socket.agentSessionId = registered?.sessionId || safeSessionId;
            
            // Register in socket registry so post-webhook code can target this agent
            socketRegistry.register(identity, socket);
            
            // Set initial heartbeat TTL
            await redisClient.setEx(
                `agent:heartbeat:${identity}`,
                HEARTBEAT_TTL_SECONDS,
                socket.agentSessionId,
            );
            
            socket.emit('agent:live_confirmed', {
                status: 'AVAILABLE',
                identity,
                sessionId: socket.agentSessionId,
            });
            await broadcastAgentCount(io);
        });


        socket.on('agent:heartbeat', async (payload) => {
            const identity = payload?.agentId || socket.agentId;
            const sessionFromClient = String(payload?.sessionId || '').trim();
            if (identity) {
                const out = await agentManager.touchHeartbeat(
                    identity,
                    sessionFromClient || socket.agentSessionId || null,
                    HEARTBEAT_TTL_SECONDS,
                );
                if (!out?.ok && out?.reason === 'session-mismatch') {
                    console.log(`[Presence] Ignoring stale heartbeat for ${identity} (session mismatch)`);
                }
            }
        });

        socket.on('agent:release', async (payload = {}) => {
            if (socket.agentId) {
                const expectedSession = String(payload?.sessionId || socket.agentSessionId || '').trim() || null;
                // Always clear active-call record before releasing back to the pool.
                // Without this, the agent is re-added as AVAILABLE while activecalls:data
                // still has their entry — next routed call gets dropped immediately.
                await agentManager.clearActiveCall(socket.agentId);
                await agentManager.releaseAgent(socket.agentId, expectedSession);
                await broadcastAgentCount(io);
            }
        });

        // Explicit go-offline (agent clicks "Go Offline" without closing the browser)
        // Removes them from the pool immediately rather than waiting for disconnect/heartbeat expiry
        socket.on('agent:go_offline', async (payload = {}) => {
            if (socket.agentId) {
                socketRegistry.unregister(socket.agentId, socket);
                const expectedSession = String(payload?.sessionId || socket.agentSessionId || '').trim() || null;
                await agentManager.removeAgent(socket.agentId, expectedSession);
                socket.agentId = null;
                socket.agentSessionId = null;
                await broadcastAgentCount(io);
                console.log(`[Socket] Agent went offline explicitly`);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.agentId) {
                socketRegistry.unregister(socket.agentId, socket);
                await agentManager.removeAgent(socket.agentId, socket.agentSessionId || null);
            }
            if (socket.notificationUid) {
                socketRegistry.unregister(socket.notificationUid, socket);
                socket.notificationUid = null;
            }
            socket.agentSessionId = null;
            await broadcastAgentCount(io);
            console.log(`❌ WebRTC Socket Disconnected: ${socket.id}`);
        });
    });
};
