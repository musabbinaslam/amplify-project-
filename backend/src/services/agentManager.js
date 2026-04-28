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
      const data = await redisClient.hGetAll(`agent:${id}`);
      if (!data || Object.keys(data).length === 0) {
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
      const data = await redisClient.hGetAll(`agent:${agentId}`);
      if (!data || Object.keys(data).length === 0) return { ok: false, reason: 'missing-agent-data' };
      if (data.sessionId && sessionId && String(data.sessionId) !== String(sessionId)) {
         return { ok: false, reason: 'session-mismatch' };
      }
      const now = Date.now().toString();
      await Promise.all([
         redisClient.hSet(`agent:${agentId}`, {
            lastSeenAt: now,
            lastHeartbeatAt: now,
         }),
         redisClient.setEx(`agent:heartbeat:${agentId}`, ttlSec, data.sessionId || sessionId || 'legacy'),
      ]);
      return { ok: true, sessionId: data.sessionId || sessionId || 'legacy' };
   }

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
      const sessionId = String(payload.sessionId || `legacy-${Date.now()}`).trim();
      const now = Date.now().toString();

      await redisClient.hSet(`agent:${agentId}`, {
         agentId,
         campaignId:     campaign,
         licensedStates: JSON.stringify(licensedStates),
         status:         'AVAILABLE',
         sessionId,
         joinedAt:       now,
         lastSeenAt:     now,
         lastHeartbeatAt: now,
         lastCallAt:     '0',   // 0 = never had a call = highest LRU priority
      });

      // Score 0 = highest priority (longest wait). Score is updated to Date.now() on each release.
      await redisClient.zAdd(this.poolKey(campaign), { score: 0, value: agentId });

      console.log(`[Redis] ✅ Agent Registered: ${agentId} | Campaign: ${campaign} | Session: ${sessionId} | States: ${licensedStates.join(', ') || 'ALL'}`);
      return { agentId, campaign, sessionId };
   }

   /**
    * Removes an agent from the pool on disconnect or go-offline.
    */
   async removeAgent(agentId, expectedSessionId = null) {
      // Read the agent's campaign so we can remove from the correct sorted set
      const data = await redisClient.hGetAll(`agent:${agentId}`);
      if (expectedSessionId && data?.sessionId && String(expectedSessionId) !== String(data.sessionId)) {
         console.log(`[Presence] Ignoring remove for ${agentId} due to session mismatch`);
         return false;
      }
      if (data?.campaignId) {
         await redisClient.zRem(this.poolKey(data.campaignId), agentId);
      }
      await redisClient.del(`agent:${agentId}`);
      await redisClient.del(`agent:heartbeat:${agentId}`);
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
                  await redisClient.del(`agent:${id}`);
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
            await redisClient.hSet(`agent:${agent.id}`, 'status', 'RINGING');
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

      const data = await redisClient.hGetAll(`agent:${agentId}`);
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

      await redisClient.hSet(`agent:${agentId}`, {
         status:      'AVAILABLE',
         lastSeenAt:  Date.now().toString(),
         lastCallAt:  Date.now().toString(),
      });

      console.log(`[Router] 🔓 Agent ${agentId} released → back to AVAILABLE (end of LRU queue)`);
      return true;
   }

   // ─── Active call tracking (unchanged) ────────────────────────────────────

   async upsertActiveCall(agentId, payload = {}) {
      if (!agentId) return;
      await redisClient.sRem('agents:ringing', agentId);
      await redisClient.sAdd('agents:busy', agentId);
      await redisClient.hSet(`agent:${agentId}`, {
         status:      'IN_CALL',
         lastSeenAt:  Date.now().toString(),
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

   async getActiveCall(agentId) {
      if (!agentId) return null;
      const row = await redisClient.hGetAll(this.activeCallKey(agentId));
      return row && Object.keys(row).length ? row : null;
   }

   async getAgentState(agentId) {
      if (!agentId) return null;
      const row = await redisClient.hGetAll(`agent:${agentId}`);
      return row && Object.keys(row).length ? row : null;
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
            await redisClient.del(`agent:${agentId}`);
         }
         evicted += 1;
         this.markDiagnostic('ghostEvicted');
      }
      return evicted;
   }
}

module.exports = new AgentManager();
