/**
 * Socket Registry — agentId → socket mapping
 *
 * Allows non-socket code (e.g. callLogService after a Twilio webhook) to emit
 * events directly to a specific connected agent without going through io.emit (broadcast).
 *
 * Usage:
 *   const socketRegistry = require('../sockets/socketRegistry');
 *   socketRegistry.emitToAgent(agentId, 'agent:balance_exhausted', { balance: 0 });
 */

const registry = new Map(); // uid (Firebase UID) -> Set<socket>

function getConnectedSet(uid, create = false) {
    let sockets = registry.get(uid);
    if (!sockets && create) {
        sockets = new Set();
        registry.set(uid, sockets);
    }
    return sockets || null;
}

module.exports = {
    /**
     * Register a socket for a given agentId. Called when agent goes live.
     */
    register(agentId, socket) {
        if (!agentId || !socket) return;
        const sockets = getConnectedSet(agentId, true);
        sockets.add(socket);
    },

    /**
     * Remove a socket registration. Called when agent goes offline or disconnects.
     */
    unregister(agentId, socket) {
        if (!agentId) return;
        if (!socket) {
            registry.delete(agentId);
            return;
        }
        const sockets = getConnectedSet(agentId);
        if (!sockets) return;
        sockets.delete(socket);
        if (!sockets.size) registry.delete(agentId);
    },

    /**
     * Emit an event to a specific agent's socket.
     * Returns true if the agent was connected and the event was sent, false otherwise.
     */
    emitToAgent(agentId, event, data) {
        const sockets = getConnectedSet(agentId);
        if (!sockets || !sockets.size) return false;
        let emitted = false;
        for (const socket of sockets) {
            if (socket && socket.connected) {
                socket.emit(event, data);
                emitted = true;
            }
        }
        return emitted;
    },

    /** True if at least one live Socket.IO connection exists for this agent. */
    isAgentConnected(agentId) {
        const sockets = getConnectedSet(agentId);
        if (!sockets?.size) return false;
        for (const socket of sockets) {
            if (socket?.connected) return true;
        }
        return false;
    },
};
