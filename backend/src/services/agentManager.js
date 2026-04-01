const { redisClient } = require('../config/redis');

class AgentManager {
   /**
    * Registers an agent in the pool when they go live.
    */
   async registerAgent(socketId, payload) {
      const agentData = {
         socketId,
         campaignId: payload.campaignId,
         status: 'AVAILABLE',
         joinedAt: Date.now().toString()
      };
      
      // Store full data in a hash map
      await redisClient.hSet(`agent:${socketId}`, agentData);
      
      // Add instantly to an AVAILABLE bucket
      await redisClient.sAdd('agents:available', socketId);
      
      console.log(`[Redis] Agent Registered: ${socketId} taking ${payload.campaignId}`);
   }

   /**
    * Clean up agent state upon disconnect.
    */
   async removeAgent(socketId) {
      await redisClient.del(`agent:${socketId}`);
      await redisClient.sRem('agents:available', socketId);
      await redisClient.sRem('agents:ringing', socketId);
      await redisClient.sRem('agents:busy', socketId);
      console.log(`[Redis] Agent Offline: ${socketId}`);
   }

   /**
    * Atomic locking: Safely find exactly one matching agent and reserve them.
    */
   async findAndLockAvailableAgent(campaignId) {
       // 1. Fetch available agents
       const availableAgents = await redisClient.sMembers('agents:available');
       if (availableAgents.length === 0) return null;

       // 2. Linear scan (For 10,000 agents we would use Redis indices, but for scale this is fast enough O(N))
       for (let socketId of availableAgents) {
           const agentData = await redisClient.hGetAll(`agent:${socketId}`);
           
           if (agentData && agentData.campaignId === campaignId) {
               
               // 3. ATOMIC LOCK: If another web request takes this agent on the same millisecond, sMove will fail (return 0).
               const locked = await redisClient.sMove('agents:available', 'agents:ringing', socketId);
               
               if (locked === 1) {
                  // We won the lock!
                  await redisClient.hSet(`agent:${socketId}`, 'status', 'RINGING');
                  console.log(`[Redis] 🔒 Locked agent ${socketId} for incoming call`);
                  return { id: socketId, ...agentData };
               }
           }
       }
       
       return null; 
   }
}

module.exports = new AgentManager();
