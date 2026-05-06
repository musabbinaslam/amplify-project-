const { redisClient } = require('../config/redis');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const PRESENCE_FRESHNESS_MS = 120 * 1000;

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
   constructor() {
      this.routingDiagnostics = {
         totalRequests: 0,
         locksWon: 0,
         raceLost: 0,
         rejectedNoHeartbeat: 0,
         rejectedMissingAgentData: 0,
         rejectedSessionMismatch: 0,
         rejectedWrongStatus: 0,
         rejectedStaleLastSeen: 0,
         ghostEvicted: 0,
         lastCandidates: 0,
         lastEligible: 0,
         updatedAt: new Date().toISOString(),
      };
   }

   // ─── Key helpers ──────────────────────────────────────────────────────────
   poolKey(campaignId)   { return `pool:${campaignId}`; }
   activeCallKey(agentId) { return `activecall:${agentId}`; }
   activeCallPattern()    { return 'activecall:*'; }

   markDiagnostic(field, delta = 1) {
      this.routingDiagnostics[field] = Number(this.routingDiagnostics[field] || 0) + delta;
      this.routingDiagnostics.updatedAt = new Date().toISOString();
   }

   getRoutingDiagnostics() {
      return {
         ...this.routingDiagnostics,
      };
   }

   isFreshLastSeen(rawLastSeenAt) {
      const lastSeenAt = Number(rawLastSeenAt || 0);
      if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return false;
      return Date.now() - lastSeenAt <= PRESENCE_FRESHNESS_MS;
   }

   async validateAgentPresence(campaignId, id, options = {}) {
      const heartbeat = await redisClient.get(`agent:heartbeat:${id}`);
      if (!heartbeat) {
         this.markDiagnostic('rejectedNoHeartbeat');
         return { ok: false, reason: 'no-heartbeat' };
      }
      const dataStr = await redisClient.hGet('agents:data', id);
      const data = dataStr ? JSON.parse(dataStr) : null;
      if (!data) {
         this.markDiagnostic('rejectedMissingAgentData');
         return { ok: false, reason: 'missing-agent-data' };
      }
      if (data.campaignId && String(data.campaignId) !== String(campaignId)) {
         return { ok: false, reason: 'campaign-mismatch' };
      }
      if (options.requireAvailable && String(data.status || '').toUpperCase() !== 'AVAILABLE') {
         this.markDiagnostic('rejectedWrongStatus');
         return { ok: false, reason: 'wrong-status' };
      }
      if (data.sessionId && String(heartbeat) !== String(data.sessionId)) {
         this.markDiagnostic('rejectedSessionMismatch');
         return { ok: false, reason: 'session-mismatch' };
      }
      if (options.requireFresh !== false && !this.isFreshLastSeen(data.lastSeenAt)) {
         this.markDiagnostic('rejectedStaleLastSeen');
         return { ok: false, reason: 'stale-last-seen' };
      }
      return { ok: true, data, heartbeat };
   }

   async touchHeartbeat(agentId, sessionId, ttlSec = 120) {
      const dataStr = await redisClient.hGet('agents:data', agentId);
      const data = dataStr ? JSON.parse(dataStr) : null;
      if (!data) return { ok: false, reason: 'missing-agent-data' };
      if (data.sessionId && sessionId && String(data.sessionId) !== String(sessionId)) {
         return { ok: false, reason: 'session-mismatch' };
      }
      const now = Date.now().toString();
      data.lastSeenAt = now;
      data.lastHeartbeatAt = now;

      await Promise.all([
         redisClient.hSet('agents:data', agentId, JSON.stringify(data)),
         redisClient.setEx(`agent:heartbeat:${agentId}`, ttlSec, data.sessionId || sessionId || 'legacy'),
         redisClient.zAdd('agents:heartbeats', { score: Date.now(), value: agentId })
      ]);
      return { ok: true, sessionId: data.sessionId || sessionId || 'legacy' };
   }

   /**
    * Registers an agent in the correct campaign pool when they go live.
    */
   async registerAgent(agentId, payload) {
      // ── Clear any stale state from a previous session ──────────────────────
      const oldDataStr = await redisClient.hGet('agents:data', agentId);
      const oldData = oldDataStr ? JSON.parse(oldDataStr) : null;
      if (oldData?.campaignId) {
         await redisClient.zRem(this.poolKey(oldData.campaignId), agentId);
      }
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);

      const campaign       = payload.campaign || payload.campaignId || 'fe_transfers';
      const licensedStates = payload.licensedStates || [];
      const sessionId = String(payload.sessionId || `legacy-${Date.now()}`).trim();
      const now = Date.now().toString();

      const newAgentData = {
         agentId,
         campaignId:     campaign,
         licensedStates: JSON.stringify(licensedStates),
         status:         'AVAILABLE',
         sessionId,
         joinedAt:       now,
         lastSeenAt:     now,
         lastHeartbeatAt: now,
         lastCallAt:     '0',   // 0 = never had a call = highest LRU priority
      };

      await redisClient.hSet('agents:data', agentId, JSON.stringify(newAgentData));

      // Score 0 = highest priority (longest wait). Score is updated to Date.now() on each release.
      await redisClient.zAdd(this.poolKey(campaign), { score: 0, value: agentId });
      
      // Add to global heartbeats tracker for efficient O(1) sweeper lookups
      await redisClient.zAdd('agents:heartbeats', { score: Date.now(), value: agentId });

      console.log(`[Redis] ✅ Agent Registered: ${agentId} | Campaign: ${campaign} | Session: ${sessionId} | States: ${licensedStates.join(', ') || 'ALL'}`);
      return { agentId, campaign, sessionId };
   }

   /**
    * Removes an agent from the pool on disconnect or go-offline.
    */
   async removeAgent(agentId, expectedSessionId = null) {
      // Read the agent's campaign so we can remove from the correct sorted set
      const dataStr = await redisClient.hGet('agents:data', agentId);
      const data = dataStr ? JSON.parse(dataStr) : null;
      if (expectedSessionId && data?.sessionId && String(expectedSessionId) !== String(data.sessionId)) {
         console.log(`[Presence] Ignoring remove for ${agentId} due to session mismatch`);
         return false;
      }
      if (data?.campaignId) {
         await redisClient.zRem(this.poolKey(data.campaignId), agentId);
      }
      await redisClient.hDel('agents:data', agentId);
      await redisClient.del(`agent:heartbeat:${agentId}`);
      await redisClient.zRem('agents:heartbeats', agentId);
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);
      console.log(`[Redis] ❌ Agent Offline: ${agentId}`);
      return true;
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
      this.markDiagnostic('totalRequests');
      // 1. Get up to 20 longest-waiting agents from this campaign's sorted set
      const candidates = await redisClient.zRange(this.poolKey(campaignId), 0, 19);
      this.routingDiagnostics.lastCandidates = candidates.length;

      console.log(`[Router] 🔍 Campaign "${campaignId}" pool — ${candidates.length} LRU candidates`);
      if (candidates.length === 0) return null;

      // 2. Parallel heartbeat + data fetch (max 20×2 = 40 Redis calls)
      const agentDataList = (await Promise.all(
         candidates.map(async (id) => {
            const presence = await this.validateAgentPresence(campaignId, id, {
               requireAvailable: true,
               requireFresh: true,
            });
            if (!presence.ok) {
               // Ghost agent: evict from the sorted set immediately
               console.log(`[Router] ⛔ Candidate rejected (${presence.reason}): ${id}`);
               await redisClient.zRem(this.poolKey(campaignId), id);
               if (presence.reason === 'no-heartbeat' || presence.reason === 'session-mismatch' || presence.reason === 'missing-agent-data') {
                  await redisClient.hDel('agents:data', id);
                  this.markDiagnostic('ghostEvicted');
               }
               return null;
            }
            return { id, ...presence.data };
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
      this.routingDiagnostics.lastEligible = eligible.length;
      console.log(`[Router] ${eligible.length} eligible agents. LRU candidates: ${eligible.map(a => a.id).join(', ')}`);

      // 4. Atomic lock: ZREM returns 1 if we successfully removed the agent (we own the lock),
      //    0 if another concurrent request already took them (race condition safe)
      for (const agent of eligible) {
         const locked = await redisClient.zRem(this.poolKey(campaignId), agent.id);
         if (locked === 1) {
            await redisClient.sAdd('agents:ringing', agent.id);
            const rawAgentStr = await redisClient.hGet('agents:data', agent.id);
            if (rawAgentStr) {
               const agentObj = JSON.parse(rawAgentStr);
               agentObj.status = 'RINGING';
               await redisClient.hSet('agents:data', agent.id, JSON.stringify(agentObj));
            }
            this.markDiagnostic('locksWon');
            console.log(`[Router] 🔒 Locked agent ${agent.id} for campaign "${campaignId}"`);
            return agent;
         }
         // Another concurrent request got there first — try next in LRU order
         this.markDiagnostic('raceLost');
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

      // OPTIMIZATION: Run all Redis checks in parallel instead of a slow loop
      const results = await Promise.all(candidates.map(async (id) => {
         const presence = await this.validateAgentPresence(campaignId, id, {
            requireAvailable: true,
            requireFresh: true,
         });
         if (!presence.ok) return false;
         const data = presence.data;
         
         try {
            const states = JSON.parse(data.licensedStates || '[]');
            // Return true if agent has no state restrictions or matches the caller state
            if (states.length === 0 || states.includes(callerState.toUpperCase())) return true;
         } catch {
            return true; // Failsafe
         }
         return false;
      }));

      // If any of the parallel checks returned true, we have an available agent
      return results.some(isAvailable => isAvailable);
   }

   /**
    * Release an agent back to the available pool after a call ends.
    * They are added back with score = Date.now() → they go to the BACK of the LRU queue.
    */
   async releaseAgent(agentId, expectedSessionId = null) {
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sRem('agents:busy', agentId);

      const dataStr = await redisClient.hGet('agents:data', agentId);
      const data = dataStr ? JSON.parse(dataStr) : null;
      if (expectedSessionId && data?.sessionId && String(expectedSessionId) !== String(data.sessionId)) {
         console.log(`[Presence] Ignoring release for ${agentId} due to session mismatch`);
         return false;
      }
      if (data?.campaignId) {
         // Score = current timestamp → this agent goes to back of LRU queue
         await redisClient.zAdd(this.poolKey(data.campaignId), {
            score: Date.now(),
            value: agentId,
         });
      }

      if (data) {
         data.status = 'AVAILABLE';
         data.lastSeenAt = Date.now().toString();
         data.lastCallAt = Date.now().toString();
         await redisClient.hSet('agents:data', agentId, JSON.stringify(data));
      }

      console.log(`[Router] 🔓 Agent ${agentId} released → back to AVAILABLE (end of LRU queue)`);
      return true;
   }

   // ─── Active call tracking (unchanged) ────────────────────────────────────

   async upsertActiveCall(agentId, payload = {}) {
      if (!agentId) return;
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sAdd('agents:busy', agentId);
      
      const rawAgentStr = await redisClient.hGet('agents:data', agentId);
      if (rawAgentStr) {
         const agentObj = JSON.parse(rawAgentStr);
         agentObj.status = 'IN_CALL';
         agentObj.lastSeenAt = Date.now().toString();
         agentObj.lastCallAt = Date.now().toString();
         await redisClient.hSet('agents:data', agentId, JSON.stringify(agentObj));
      }

      const activeCallData = {
         agentId,
         callSid:    String(payload.callSid    || ''),
         from:       String(payload.from       || ''),
         to:         String(payload.to         || ''),
         campaignId: String(payload.campaignId || ''),
         startedAt:  String(payload.startedAt  || new Date().toISOString()),
         state:      String(payload.state      || 'in_call'),
         updatedAt:  new Date().toISOString(),
      };
      await redisClient.hSet('activecalls:data', agentId, JSON.stringify(activeCallData));
   }

   async clearActiveCall(agentId) {
      if (!agentId) return;
      await redisClient.hDel('activecalls:data', agentId);
   }

   async setAgentWrapUp(agentId) {
      if (!agentId) return;
      await redisClient.sRem('agents:busy', agentId);
      
      const rawStr = await redisClient.hGet('agents:data', agentId);
      if (rawStr) {
         const data = JSON.parse(rawStr);
         data.status = 'WRAP_UP';
         data.lastSeenAt = Date.now().toString();
         await redisClient.hSet('agents:data', agentId, JSON.stringify(data));
      }
      console.log(`[Router] 📝 Agent ${agentId} entered WRAP_UP (disposition pending)`);
   }

   async getActiveCall(agentId) {
      if (!agentId) return null;
      const rawStr = await redisClient.hGet('activecalls:data', agentId);
      return rawStr ? JSON.parse(rawStr) : null;
   }

   async getAgentState(agentId) {
      if (!agentId) return null;
      const rawStr = await redisClient.hGet('agents:data', agentId);
      return rawStr ? JSON.parse(rawStr) : null;
   }

   async listActiveCallAgentIds() {
      const keys = await redisClient.hKeys('activecalls:data');
      return keys || [];
   }

   async findAgentIdByCallSid(callSid) {
      const target = String(callSid || '').trim();
      if (!target) return null;
      const ids = await this.listActiveCallAgentIds();
      const activeCalls = await redisClient.hGetAll('activecalls:data');
      for (const [agentId, callStr] of Object.entries(activeCalls)) {
         const row = JSON.parse(callStr);
         if (row?.callSid && String(row.callSid).trim() === target) return agentId;
      }
      return null;
   }

   async listActiveCalls() {
      const [busyIds, keyedIds, allActiveCallsStr, allAgentsStr] = await Promise.all([
         redisClient.sMembers('agents:busy'),
         this.listActiveCallAgentIds(),
         redisClient.hGetAll('activecalls:data'),
         redisClient.hGetAll('agents:data'),
      ]);
      const agentIds = [...new Set([...(busyIds || []), ...(keyedIds || [])])];
      if (!agentIds.length) return [];
      
      const rows = agentIds.map((id) => {
         const rowStr = allActiveCallsStr[id];
         const agentStr = allAgentsStr[id];
         if (!rowStr) return null;
         
         const row = JSON.parse(rowStr);
         const agent = agentStr ? JSON.parse(agentStr) : {};
         
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
      });
      
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
      const [pool, allAgentsStr] = await Promise.all([
         this.getPoolSnapshot(),
         redisClient.hGetAll('agents:data')
      ]);
      
      const idSet = new Set([...pool.available, ...pool.ringing, ...pool.busy]);
      const agents = [];
      const byCampaign = {};

      for (const id of idSet) {
         const rawStr = allAgentsStr[id];
         if (!rawStr) continue;
         const raw = JSON.parse(rawStr);

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

   async evictStaleAgentsFromCampaign(campaignId) {
      const poolKey = this.poolKey(campaignId);
      const candidates = await redisClient.zRange(poolKey, 0, -1);
      let evicted = 0;
      for (const agentId of candidates) {
         // eslint-disable-next-line no-await-in-loop
         const presence = await this.validateAgentPresence(campaignId, agentId, {
            requireAvailable: false,
            requireFresh: true,
         });
         if (presence.ok) continue;
         // eslint-disable-next-line no-await-in-loop
         await redisClient.zRem(poolKey, agentId);
         if (['no-heartbeat', 'session-mismatch', 'missing-agent-data'].includes(presence.reason)) {
            // eslint-disable-next-line no-await-in-loop
            await redisClient.hDel('agents:data', agentId);
         }
         evicted += 1;
         this.markDiagnostic('ghostEvicted');
      }
      return evicted;
   }
}

module.exports = new AgentManager();
