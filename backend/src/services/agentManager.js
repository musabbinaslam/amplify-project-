const { redisClient } = require('../config/redis');
const { CAMPAIGN_CONFIG } = require('../config/pricing');

/**
 * AgentManager — Per-Campaign Sorted Set Routing
 *
 * Architecture:
 *   pool:{campaignId}          → Redis Sorted Set  (score = lastCallAt ms; 0 = never had a call)
 *                                 ZRANGE 0 19 returns the 20 agents who waited longest (LRU)
 *   agents:ringing             → Redis Set          (locked agents currently ringing)
 *   agents:busy                → Redis Set          (agents on an active call)
 *   agent:{id}                 → Redis Hash         (campaignId, licensedStates, status, etc.)
 *   agent:heartbeat:{id}       → Redis String / TTL (60s; absence = ghost agent → evict)
 *   activecall:{id}            → Redis Hash         (live call metadata for status callbacks)
 *
 * Routing complexity:
 *   Old design: O(N×2) Redis calls for N total available agents
 *   New design: O(K×2) where K = candidates checked (capped at 20), regardless of total pool size
 *   → 1000 agents = max ~41 Redis calls per routing request (vs 2001 before)
 *
 * Atomic lock:
 *   ZREM returns 1 if the member was present and removed, 0 if already gone.
 *   Only one concurrent routing request can receive a return value of 1 for a given agent.
 *   No double-routing is possible.
 */
class AgentManager {

   // ─── Key helpers ──────────────────────────────────────────────────────────
   poolKey(campaignId)   { return `pool:${campaignId}`; }
   activeCallKey(agentId) { return `activecall:${agentId}`; }
   activeCallPattern()    { return 'activecall:*'; }

   /**
    * Registers an agent in the correct campaign pool when they go live.
    */
   async registerAgent(agentId, payload) {
      // ── Clear any stale state from a previous session ──────────────────────
      const oldData = await redisClient.hGetAll(`agent:${agentId}`);
      if (oldData?.campaignId) {
         await redisClient.zRem(this.poolKey(oldData.campaignId), agentId);
      }
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);

      const campaign       = payload.campaign || payload.campaignId || 'fe_transfers';
      const licensedStates = payload.licensedStates || [];

      await redisClient.hSet(`agent:${agentId}`, {
         agentId,
         campaignId:     campaign,
         licensedStates: JSON.stringify(licensedStates),
         status:         'AVAILABLE',
         joinedAt:       Date.now().toString(),
         lastCallAt:     '0',   // 0 = never had a call = highest LRU priority
      });

      // Score 0 = highest priority (longest wait). Score is updated to Date.now() on each release.
      await redisClient.zAdd(this.poolKey(campaign), { score: 0, value: agentId });

      console.log(`[Redis] ✅ Agent Registered: ${agentId} | Campaign: ${campaign} | States: ${licensedStates.join(', ') || 'ALL'}`);
   }

   /**
    * Removes an agent from the pool on disconnect or go-offline.
    */
   async removeAgent(agentId) {
      // Read the agent's campaign so we can remove from the correct sorted set
      const data = await redisClient.hGetAll(`agent:${agentId}`);
      if (data?.campaignId) {
         await redisClient.zRem(this.poolKey(data.campaignId), agentId);
      }
      await redisClient.del(`agent:${agentId}`);
      await redisClient.del(`agent:heartbeat:${agentId}`);
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);
      console.log(`[Redis] ❌ Agent Offline: ${agentId}`);
   }

   /**
    * LRU Routing — O(K×2) Redis calls, K ≤ 20, regardless of total pool size.
    *
    * Steps:
    *  1. ZRANGE pool:{campaign} 0 19   → up to 20 LRU candidates (score ascending = waited longest)
    *  2. Parallel heartbeat + hash fetch for those 20 candidates only
    *  3. Evict ghosts, filter by licensed state
    *  4. ZREM as atomic lock — only the request that gets return value 1 wins the agent
    */
   async findAndLockAvailableAgent(campaignId, callerState = null) {
      // 1. Get up to 20 longest-waiting agents from this campaign's sorted set
      const candidates = await redisClient.zRange(this.poolKey(campaignId), 0, 19);

      console.log(`[Router] 🔍 Campaign "${campaignId}" pool — ${candidates.length} LRU candidates`);
      if (candidates.length === 0) return null;

      // 2. Parallel heartbeat + data fetch (max 20×2 = 40 Redis calls)
      const agentDataList = (await Promise.all(
         candidates.map(async (id) => {
            const isAlive = await redisClient.exists(`agent:heartbeat:${id}`);
            if (!isAlive) {
               // Ghost agent: evict from the sorted set immediately
               console.log(`[Router] 👻 Ghost agent evicted (no heartbeat): ${id}`);
               await redisClient.zRem(this.poolKey(campaignId), id);
               await redisClient.del(`agent:${id}`);
               return null;
            }
            const data = await redisClient.hGetAll(`agent:${id}`);
            return data ? { id, ...data } : null;
         })
      )).filter(Boolean);

      if (agentDataList.length === 0) return null;

      // 3. Filter by licensed state (if a caller state is provided)
      let eligible = agentDataList;
      if (callerState) {
         eligible = agentDataList.filter((agent) => {
            try {
               const states = JSON.parse(agent.licensedStates || '[]');
               // Empty array = licensed in all states (no restriction)
               return states.length === 0 || states.includes(callerState.toUpperCase());
            } catch {
               return true; // Parse failure → don't block routing
            }
         });

         if (eligible.length === 0) {
            console.log(`[Router] No agents licensed in "${callerState}" for campaign "${campaignId}"`);
            return null;
         }
      }

      // Candidates are already in LRU order from ZRANGE (lowest score = waited longest = first)
      console.log(`[Router] ${eligible.length} eligible agents. LRU candidates: ${eligible.map(a => a.id).join(', ')}`);

      // 4. Atomic lock: ZREM returns 1 if we successfully removed the agent (we own the lock),
      //    0 if another concurrent request already took them (race condition safe)
      for (const agent of eligible) {
         const locked = await redisClient.zRem(this.poolKey(campaignId), agent.id);
         if (locked === 1) {
            await redisClient.sAdd('agents:ringing', agent.id);
            await redisClient.hSet(`agent:${agent.id}`, 'status', 'RINGING');
            console.log(`[Router] 🔒 Locked agent ${agent.id} for campaign "${campaignId}"`);
            return agent;
         }
         // Another concurrent request got there first — try next in LRU order
         console.log(`[Router] ⚡ Race: agent ${agent.id} already taken, trying next...`);
      }

      return null;
   }

   /**
    * CAPACITY PING: Check if any agent is available for a given campaign/state.
    * Used by Ringba/Trackdrive before dialing. Does NOT lock anyone.
    */
   async checkAvailableAgent(campaignId, callerState = null) {
      const candidates = await redisClient.zRange(this.poolKey(campaignId), 0, 9);
      if (candidates.length === 0) return false;

      if (!callerState) return true; // Has agents, no state filter needed

      for (const id of candidates) {
         const isAlive = await redisClient.exists(`agent:heartbeat:${id}`);
         if (!isAlive) continue;
         const data = await redisClient.hGetAll(`agent:${id}`);
         if (!data) continue;
         try {
            const states = JSON.parse(data.licensedStates || '[]');
            if (states.length === 0 || states.includes(callerState.toUpperCase())) return true;
         } catch {
            return true;
         }
      }
      return false;
   }

   /**
    * Release an agent back to the available pool after a call ends.
    * They are added back with score = Date.now() → they go to the BACK of the LRU queue.
    */
   async releaseAgent(agentId) {
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);

      const data = await redisClient.hGetAll(`agent:${agentId}`);
      if (data?.campaignId) {
         // Score = current timestamp → this agent goes to back of LRU queue
         await redisClient.zAdd(this.poolKey(data.campaignId), {
            score: Date.now(),
            value: agentId,
         });
      }

      await redisClient.hSet(`agent:${agentId}`, {
         status:      'AVAILABLE',
         lastCallAt:  Date.now().toString(),
      });

      console.log(`[Router] 🔓 Agent ${agentId} released → back to AVAILABLE (end of LRU queue)`);
   }

   // ─── Active call tracking (unchanged) ────────────────────────────────────

   async upsertActiveCall(agentId, payload = {}) {
      if (!agentId) return;
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sAdd('agents:busy', agentId);
      await redisClient.hSet(`agent:${agentId}`, {
         status:      'IN_CALL',
         lastCallAt:  Date.now().toString(),
      });
      await redisClient.hSet(this.activeCallKey(agentId), {
         agentId,
         callSid:    String(payload.callSid    || ''),
         from:       String(payload.from       || ''),
         to:         String(payload.to         || ''),
         campaignId: String(payload.campaignId || ''),
         startedAt:  String(payload.startedAt  || new Date().toISOString()),
         state:      String(payload.state      || 'in_call'),
         updatedAt:  new Date().toISOString(),
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
            const row   = await redisClient.hGetAll(this.activeCallKey(id));
            const agent = await redisClient.hGetAll(`agent:${id}`);
            if (!row || Object.keys(row).length === 0) return null;
            const startedAtMs = row.startedAt ? new Date(row.startedAt).getTime() : NaN;
            return {
               agentId:     id,
               callSid:     row.callSid   || null,
               from:        row.from      || null,
               to:          row.to        || null,
               campaignId:  row.campaignId || agent.campaignId || null,
               startedAt:   row.startedAt || null,
               durationSec: Number.isNaN(startedAtMs) ? 0 : Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
               status:      agent.status  || 'IN_CALL',
               state:       row.state     || 'in_call',
            };
         }),
      );
      return rows.filter(Boolean);
   }

   // ─── Snapshot / overview (aggregates across all campaign pools) ───────────

   async getPoolSnapshot() {
      const campaignIds = Object.keys(CAMPAIGN_CONFIG);
      const availableSets = await Promise.all(
         campaignIds.map((cId) => redisClient.zRange(this.poolKey(cId), 0, -1))
      );
      const available = [...new Set(availableSets.flat())];
      const [ringing, busy] = await Promise.all([
         redisClient.sMembers('agents:ringing'),
         redisClient.sMembers('agents:busy'),
      ]);
      return { available, ringing, busy };
   }

   /**
    * Total available agent count across all campaign pools — used for stats:agent_count broadcast.
    */
   async getTotalAvailableCount() {
      const campaignIds = Object.keys(CAMPAIGN_CONFIG);
      const counts = await Promise.all(
         campaignIds.map((cId) => redisClient.zCard(this.poolKey(cId)))
      );
      // Sum all campaign pools (an agent is only ever in one campaign pool at a time)
      return counts.reduce((a, b) => a + (b || 0), 0);
   }

   async getOverview() {
      const pool = await this.getPoolSnapshot();
      const idSet = new Set([...pool.available, ...pool.ringing, ...pool.busy]);
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
            agentId:       raw.agentId || id,
            campaignId,
            status:        raw.status  || 'UNKNOWN',
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

      return { pool, totalAgents: agents.length, agents, byCampaign };
   }
}

module.exports = new AgentManager();
