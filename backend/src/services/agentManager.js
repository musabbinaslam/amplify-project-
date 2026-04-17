const { redisClient } = require('../config/redis');

class AgentManager {
   activeCallKey(agentId) {
      return `activecall:${agentId}`;
   }
   activeCallPattern() {
      return 'activecall:*';
   }
   /**
    * Registers an agent in the pool when they go live.
    */
   async registerAgent(agentId, payload) {
      // CLEAR ANY PREVIOUS STUCK STATE
      await redisClient.sRem('agents:available', agentId);
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);

      const campaign = payload.campaign || payload.campaignId || 'fe_transfers';
      const licensedStates = payload.licensedStates || []; // e.g. ['TX', 'FL', 'CA']

      const agentData = {
         agentId,
         campaignId: campaign,
         licensedStates: JSON.stringify(licensedStates),
         status: 'AVAILABLE',
         joinedAt: Date.now().toString(),
         lastCallAt: '0' // 0 = never had a call = highest priority (LRU)
      };

      // Store full data in a hash map
      await redisClient.hSet(`agent:${agentId}`, agentData);

      // Add to AVAILABLE set
      await redisClient.sAdd('agents:available', agentId);

      console.log(`[Redis] ✅ Agent Registered: ${agentId} | Campaign: ${campaign} | States: ${licensedStates.join(', ') || 'ALL'}`);
   }

   /**
    * Clean up agent state upon disconnect.
    */
   async removeAgent(agentId) {
      await redisClient.del(`agent:${agentId}`);
      await redisClient.sRem('agents:available', agentId);
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);
      console.log(`[Redis] ❌ Agent Offline: ${agentId}`);
   }

   /**
    * LRU Routing: Find the agent who has been waiting longest,
    * matches the campaign, and is licensed in the caller's state.
    * Uses atomic Redis lock to prevent double-routing.
    */
   async findAndLockAvailableAgent(campaignId, callerState = null) {
      // 1. Fetch all available agent IDs
      const availableIds = await redisClient.sMembers('agents:available');
      console.log(`[Router] 🔍 Checking available agents in Redis. Found: ${availableIds.length} agents (${availableIds.join(', ')})`);
      if (availableIds.length === 0) return null;

      // 2. Fetch full data for each available agent & verify heartbeat
      const agentDataList = (await Promise.all(
         availableIds.map(async (id) => {
            const isAlive = await redisClient.exists(`agent:heartbeat:${id}`);
            if (!isAlive) {
               console.log(`[Router] 👻 Ghost agent detected (no heartbeat): ${id}. Evicting...`);
               await redisClient.sRem('agents:available', id);
               await redisClient.del(`agent:${id}`);
               return null;
            }
            const data = await redisClient.hGetAll(`agent:${id}`);
            return { id, ...data };
         })
      )).filter(Boolean);

      // 3. Filter by campaign match
      const campaignMatches = agentDataList.filter(agent => {
         if (!agent.campaignId) return false;
         return agent.campaignId === campaignId || !campaignId || agent.campaignId === 'all';
      });

      if (campaignMatches.length === 0) {
         console.log(`[Router] No agents found for campaign "${campaignId}"`);
         return null;
      }

      // 4. Filter by licensed state (if a caller state is provided)
      let stateMatches = campaignMatches;
      if (callerState) {
         stateMatches = campaignMatches.filter(agent => {
            try {
               const states = JSON.parse(agent.licensedStates || '[]');
               // Empty array = licensed in all states
               return states.length === 0 || states.includes(callerState.toUpperCase());
            } catch {
               return true; // If parse fails, don't block
            }
         });

         if (stateMatches.length === 0) {
            console.log(`[Router] No agents licensed in state "${callerState}" for campaign "${campaignId}"`);
            return null;
         }
      }

      // 5. SORT BY LRU — agent with smallest lastCallAt waited the longest
      stateMatches.sort((a, b) => {
         const aTime = parseInt(a.lastCallAt || '0');
         const bTime = parseInt(b.lastCallAt || '0');
         return aTime - bTime; // ascending: smallest time = waited longest = first priority
      });

      console.log(`[Router] ${stateMatches.length} eligible agents. LRU order: ${stateMatches.map(a => `${a.id}(${a.lastCallAt})`).join(', ')}`);

      // 6. Try to atomically lock the highest-priority agent
      for (const agent of stateMatches) {
         const locked = await redisClient.sMove('agents:available', 'agents:ringing', agent.id);

         if (locked === 1) {
            // Won the lock — mark as ringing
            await redisClient.hSet(`agent:${agent.id}`, 'status', 'RINGING');
            console.log(`[Router] 🔒 Locked agent ${agent.id} (LRU: waited since ${agent.lastCallAt === '0' ? 'start' : new Date(parseInt(agent.lastCallAt)).toISOString()})`);
            return agent;
         }
         // If lock failed, another request grabbed this agent — try next in LRU order
      }

      return null;
   }

   /**
    * CAPACITY PING: Checks if an agent is available without locking them.
    * Used by Ringba/Trackdrive to ping before dialing.
    */
   async checkAvailableAgent(campaignId, callerState = null) {
      const availableIds = await redisClient.sMembers('agents:available');
      if (availableIds.length === 0) return false;

      const agentDataList = (await Promise.all(
         availableIds.map(async (id) => {
            const isAlive = await redisClient.exists(`agent:heartbeat:${id}`);
            if (!isAlive) {
               await redisClient.sRem('agents:available', id);
               await redisClient.del(`agent:${id}`);
               return null;
            }
            const data = await redisClient.hGetAll(`agent:${id}`);
            return { id, ...data };
         })
      )).filter(Boolean);

      const campaignMatches = agentDataList.filter(agent => {
         if (!agent.campaignId) return false;
         return agent.campaignId === campaignId || !campaignId || agent.campaignId === 'all';
      });

      if (campaignMatches.length === 0) return false;

      if (callerState) {
         const stateMatches = campaignMatches.filter(agent => {
            try {
               const states = JSON.parse(agent.licensedStates || '[]');
               return states.length === 0 || states.includes(callerState.toUpperCase());
            } catch {
               return true;
            }
         });
         if (stateMatches.length === 0) return false;
      }

      return true;
   }

   /**
    * Moves an agent back to AVAILABLE after a call ends.
    * Updates lastCallAt so they go to the BACK of the LRU queue.
    */
   async releaseAgent(agentId) {
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);
      await redisClient.sAdd('agents:available', agentId);

      // Update lastCallAt to NOW → they go to back of the queue
      await redisClient.hSet(`agent:${agentId}`, {
         status: 'AVAILABLE',
         lastCallAt: Date.now().toString()
      });

      console.log(`[Router] 🔓 Agent ${agentId} released → back to AVAILABLE (moved to back of LRU queue)`);
   }

   async upsertActiveCall(agentId, payload = {}) {
      if (!agentId) return;
      await redisClient.sRem('agents:available', agentId);
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sAdd('agents:busy', agentId);
      await redisClient.hSet(`agent:${agentId}`, {
         status: 'IN_CALL',
         lastCallAt: Date.now().toString(),
      });
      await redisClient.hSet(this.activeCallKey(agentId), {
         agentId,
         callSid: String(payload.callSid || ''),
         from: String(payload.from || ''),
         to: String(payload.to || ''),
         campaignId: String(payload.campaignId || ''),
         startedAt: String(payload.startedAt || new Date().toISOString()),
         state: String(payload.state || 'in_call'),
         updatedAt: new Date().toISOString(),
      });
   }

   async clearActiveCall(agentId) {
      if (!agentId) return;
      await redisClient.del(this.activeCallKey(agentId));
   }

   async listActiveCallAgentIds() {
      const ids = new Set();
      for await (const key of redisClient.scanIterator({ MATCH: this.activeCallPattern(), COUNT: 200 })) {
         const raw = String(key || '');
         if (!raw.startsWith('activecall:')) continue;
         const agentId = raw.slice('activecall:'.length);
         if (agentId) ids.add(agentId);
      }
      return [...ids];
   }

   async findAgentIdByCallSid(callSid) {
      const target = String(callSid || '').trim();
      if (!target) return null;
      const ids = await this.listActiveCallAgentIds();
      for (const agentId of ids) {
         // eslint-disable-next-line no-await-in-loop
         const row = await redisClient.hGetAll(this.activeCallKey(agentId));
         if (row?.callSid && String(row.callSid).trim() === target) return agentId;
      }
      return null;
   }

   async listActiveCalls() {
      const [busyIds, keyedIds] = await Promise.all([
         redisClient.sMembers('agents:busy'),
         this.listActiveCallAgentIds(),
      ]);
      const agentIds = [...new Set([...(busyIds || []), ...(keyedIds || [])])];
      if (!agentIds.length) return [];
      const rows = await Promise.all(
         agentIds.map(async (id) => {
            const row = await redisClient.hGetAll(this.activeCallKey(id));
            const agent = await redisClient.hGetAll(`agent:${id}`);
            if (!row || Object.keys(row).length === 0) return null;
            const startedAtMs = row.startedAt ? new Date(row.startedAt).getTime() : NaN;
            return {
               agentId: id,
               callSid: row.callSid || null,
               from: row.from || null,
               to: row.to || null,
               campaignId: row.campaignId || agent.campaignId || null,
               startedAt: row.startedAt || null,
               durationSec: Number.isNaN(startedAtMs) ? 0 : Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
               status: agent.status || 'IN_CALL',
               state: row.state || 'in_call',
            };
         }),
      );
      return rows.filter(Boolean);
   }

   /**
    * Get a snapshot of the current agent pool for debugging.
    */
   async getPoolSnapshot() {
      const [available, ringing, busy] = await Promise.all([
         redisClient.sMembers('agents:available'),
         redisClient.sMembers('agents:ringing'),
         redisClient.sMembers('agents:busy'),
      ]);
      return { available, ringing, busy };
   }

   /**
    * Collect unique agent ids across pool sets and return full agent hashes + counts by campaign.
    */
   async getOverview() {
      const pool = await this.getPoolSnapshot();
      const idSet = new Set([
         ...pool.available,
         ...pool.ringing,
         ...pool.busy,
      ]);
      const agents = [];
      const byCampaign = {};

      for (const id of idSet) {
         const raw = await redisClient.hGetAll(`agent:${id}`);
         if (!raw || Object.keys(raw).length === 0) continue;

         let licensedStates = [];
         try {
            licensedStates = JSON.parse(raw.licensedStates || '[]');
            if (!Array.isArray(licensedStates)) licensedStates = [];
         } catch {
            licensedStates = [];
         }

         const campaignId = raw.campaignId || 'unknown';
         const row = {
            id,
            agentId: raw.agentId || id,
            campaignId,
            status: raw.status || 'UNKNOWN',
            licensedStates,
            pool: pool.available.includes(id)
               ? 'available'
               : pool.ringing.includes(id)
                  ? 'ringing'
                  : pool.busy.includes(id)
                     ? 'busy'
                     : 'unknown',
         };
         agents.push(row);
         byCampaign[campaignId] = (byCampaign[campaignId] || 0) + 1;
      }

      return {
         pool,
         totalAgents: agents.length,
         agents,
         byCampaign,
      };
   }
}

module.exports = new AgentManager();
