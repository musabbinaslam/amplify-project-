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

const registry = new Map(); // agentId (Firebase UID) → socket instance

module.exports = {
    /**
     * Register a socket for a given agentId. Called when agent goes live.
     */
    register(agentId, socket) {
        registry.set(agentId, socket);
    },

    /**
     * Remove a socket registration. Called when agent goes offline or disconnects.
     */
    unregister(agentId) {
        registry.delete(agentId);
    },

    /**
     * Emit an event to a specific agent's socket.
     * Returns true if the agent was connected and the event was sent, false otherwise.
     */
    emitToAgent(agentId, event, data) {
        const socket = registry.get(agentId);
        if (socket && socket.connected) {
            socket.emit(event, data);
            return true;
        }
        return false;
    },
};
