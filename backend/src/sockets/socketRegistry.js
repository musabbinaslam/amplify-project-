/**
 * Socket Registry — multi-node safe agent targeting via Socket.IO rooms.
 *
 * Agents join room `agent:{uid}` on notification:register / agent:go_live.
 * emitToAgent uses io.to(room) so the Redis adapter routes to whichever
 * Node process holds the socket(s).
 *
 * Usage:
 *   const socketRegistry = require('../sockets/socketRegistry');
 *   socketRegistry.init(io); // once after Redis adapter attach
 *   await socketRegistry.emitToAgent(agentId, 'agent:balance_exhausted', { balance: 0 });
 */

const { redisClient } = require('../config/redis');

let io = null;

function roomFor(agentId) {
    return `agent:${String(agentId)}`;
}

function init(socketIo) {
    io = socketIo;
}

/**
 * Join a socket to the agent's room so targeted emits reach this connection.
 */
function joinAgent(socket, agentId) {
    if (!socket || !agentId) return;
    const id = String(agentId).trim();
    if (!id) return;
    const room = roomFor(id);
    socket.join(room);
    console.log(`[socketRegistry] Joined socket ${socket.id} to ${room}`);
}

/**
 * Leave the agent room (optional — disconnect auto-leaves rooms).
 */
function leaveAgent(socket, agentId) {
    if (!socket || !agentId) return;
    const id = String(agentId).trim();
    if (!id) return;
    const room = roomFor(id);
    socket.leave(room);
    console.log(`[socketRegistry] Left socket ${socket.id} from ${room}`);
}

/**
 * Emit an event to all sockets in the agent's room (cross-node via Redis adapter).
 * Always publishes via io.to(room); membership check is best-effort for the return value.
 * Returns true if at least one socket was found in the room (or emit succeeded after a
 * fetchSockets timeout — the Redis publish still ran).
 */
async function emitToAgent(agentId, event, data) {
    if (!io || !agentId) {
        console.log(`[socketRegistry] emitToAgent skipped: io=${Boolean(io)} agentId=${agentId} (event: ${event})`);
        return false;
    }
    const id = String(agentId).trim();
    if (!id) return false;

    const room = roomFor(id);
    try {
        // Always publish first — Redis adapter delivers to the node that holds the socket(s).
        io.to(room).emit(event, data);

        // Membership check across nodes (may race briefly when a process just joined the cluster).
        let sockets = [];
        try {
            sockets = await io.in(room).fetchSockets();
        } catch (fetchErr) {
            console.warn(`[socketRegistry] fetchSockets failed after emit (event still published): ${fetchErr.message}`);
            return true;
        }

        if (!sockets.length) {
            console.log(`[socketRegistry] emitToAgent: ${event} to ${id} — published, but no sockets currently in ${room}`);
            return false;
        }
        console.log(`[socketRegistry] emitToAgent: ${event} to ${id} (${sockets.length} socket(s)). Success: true`);
        return true;
    } catch (err) {
        console.error(`[socketRegistry] emitToAgent error for ${id} (${event}):`, err.message);
        return false;
    }
}

/**
 * True if the agent has a live Redis heartbeat (browser session presence).
 * Prefer this over fetchSockets for hot-path presence checks.
 */
async function isAgentConnected(agentId) {
    if (!agentId) return false;
    try {
        const hb = await redisClient.get(`agent:heartbeat:${String(agentId).trim()}`);
        return Boolean(hb);
    } catch {
        return false;
    }
}

module.exports = {
    init,
    roomFor,
    joinAgent,
    leaveAgent,
    emitToAgent,
    isAgentConnected,
    /** @deprecated use joinAgent */
    register: joinAgent,
    /** @deprecated use leaveAgent */
    unregister: leaveAgent,
};
