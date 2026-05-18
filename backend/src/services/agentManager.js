const { redisClient } = require('../config/redis');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const PRESENCE_FRESHNESS_MS = 120 * 1000;
const WRAPUP_MAX_AGE_MS    = 10 * 60 * 1000;  // 10 min — WRAP_UP must not last longer
const INCALL_MAX_AGE_MS    = 90 * 60 * 1000;  // 90 min — force-evict any zombie IN_CALL

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
   poolKey(campaignId) { return `pool:${campaignId}`; }

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
      // Also clear any orphaned active-call record from a prior session so the
      // agent never starts a new session already showing as IN_CALL.
      await redisClient.hDel('activecalls:data', agentId);

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
      // Clear any stale active-call record so a logged-out agent
      // does not continue to appear as IN_CALL on the admin dashboard.
      await redisClient.hDel('activecalls:data', agentId);
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

      // Always clear the active-call record atomically before re-entering the pool.
      // This prevents the "AVAILABLE but IN_CALL" split-state that causes dropped calls.
      await redisClient.hDel('activecalls:data', agentId);

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

      // ── Self-healing: evict agents with no heartbeat unless they're in WRAP_UP ──
      // WRAP_UP agents have submitted their call but are filling disposition — their
      // heartbeat key may have expired (120s TTL) but they are NOT ghosts.
      // Only evict if: no heartbeat AND status is not WRAP_UP.
      const heartbeatChecks = await Promise.all(
         agentIds.map(async (id) => {
            const hb = await redisClient.get(`agent:heartbeat:${id}`);
            if (hb) return { id, alive: true };
            // No heartbeat — check if they're in a legitimate WRAP_UP state
            const agentStr = allAgentsStr[id];
            const agentStatus = agentStr ? JSON.parse(agentStr).status : null;
            const isWrapUp = agentStatus === 'WRAP_UP';
            return { id, alive: isWrapUp }; // treat WRAP_UP as alive even without heartbeat
         })
      );
      const ghostIds = heartbeatChecks.filter((c) => !c.alive).map((c) => c.id);
      if (ghostIds.length > 0) {
         await Promise.all(
            ghostIds.map((id) => Promise.all([
               redisClient.hDel('activecalls:data', id),
               redisClient.sRem('agents:busy', id),
               redisClient.sRem('agents:ringing', id),
               redisClient.hDel('agents:data', id),
            ]))
         );
         console.log(`[listActiveCalls] 🧹 Self-healed ${ghostIds.length} ghost active-call(s): ${ghostIds.join(', ')}`);
      }
      const liveIds = heartbeatChecks.filter((c) => c.alive).map((c) => c.id);

      const rows = liveIds.map((id) => {
         const rowStr = allActiveCallsStr[id];
         const agentStr = allAgentsStr[id];
         if (!rowStr) return null;

         const row = JSON.parse(rowStr);
         const agent = agentStr ? JSON.parse(agentStr) : {};

         // Always use the agent's real status — but if it is somehow AVAILABLE
         // while the call record exists, override to IN_CALL. An entry in
         // activecalls:data is the authoritative source of truth for call state.
         const rawStatus = agent.status || 'IN_CALL';
         const displayStatus = rawStatus === 'AVAILABLE' ? 'IN_CALL' : rawStatus;

         const startedAtMs = row.startedAt ? new Date(row.startedAt).getTime() : NaN;
         return {
            agentId:     id,
            callSid:     row.callSid   || null,
            from:        row.from      || null,
            to:          row.to        || null,
            campaignId:  row.campaignId || agent.campaignId || null,
            startedAt:   row.startedAt || null,
            durationSec: Number.isNaN(startedAtMs) ? 0 : Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
            status:      displayStatus,
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

      // Start with agents known from pool sets
      const idSet = new Set([...pool.available, ...pool.ringing, ...pool.busy]);

      // Also include WRAP_UP agents — they are NOT in any pool set (removed by setAgentWrapUp)
      // but should still be visible in the Active Agents panel.
      for (const [id, rawStr] of Object.entries(allAgentsStr || {})) {
         try {
            const parsed = JSON.parse(rawStr);
            if (parsed.status === 'WRAP_UP') idSet.add(id);
         } catch { /* ignore corrupt entries */ }
      }

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

         // WRAP_UP agents are not in any pool set — detect via agents:data.status
         const isWrapUp = raw.status === 'WRAP_UP';
         const poolSlot = pool.available.includes(id)
               ? 'available'
               : pool.ringing.includes(id)
                  ? 'ringing'
                  : pool.busy.includes(id)
                     ? 'busy'
                     : isWrapUp
                        ? 'wrap_up'
                        : 'unknown';

         // Derive authoritative status from pool membership — agents:data.status
         // can be stale (e.g., still AVAILABLE after a mid-flight state change).
         // Pool set membership is the ground truth; WRAP_UP is read from agents:data.
         const derivedStatus = poolSlot === 'busy'
            ? 'IN_CALL'
            : poolSlot === 'ringing'
               ? 'RINGING'
               : poolSlot === 'available'
                  ? 'AVAILABLE'
                  : isWrapUp
                     ? 'WRAP_UP'
                     : raw.status || 'UNKNOWN';

         const row = {
            id,
            agentId:       raw.agentId || id,
            campaignId,
            status:        derivedStatus,
            licensedStates,
            pool:          poolSlot,
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

   /**
    * Sweeps the activecalls:data hash for orphaned entries — agents that have an
    * active-call record but no live heartbeat key, OR whose call has exceeded the
    * maximum allowed duration (zombie calls). Also enforces a WRAP_UP timeout.
    * Called by the server's periodic ghost cleanup job as a catch-all safety net.
    * Returns the number of orphaned entries that were evicted.
    */
   async evictStaleActiveCalls() {
      const now = Date.now();
      const [allCalls, allAgents] = await Promise.all([
         redisClient.hGetAll('activecalls:data'),
         redisClient.hGetAll('agents:data'),
      ]);
      if (!allCalls || !Object.keys(allCalls).length) return 0;

      let evicted = 0;
      await Promise.all(
         Object.keys(allCalls).map(async (agentId) => {
            const hb = await redisClient.get(`agent:heartbeat:${agentId}`);
            const agentStr = allAgents[agentId];
            const agent = agentStr ? JSON.parse(agentStr) : null;
            const agentStatus = agent?.status || null;

            // ── Check 1: WRAP_UP timeout ─────────────────────────────────────
            // WRAP_UP agents don't need a heartbeat — but if they've been in
            // WRAP_UP for more than WRAPUP_MAX_AGE_MS, the browser was likely
            // closed without submitting disposition. Release them.
            if (agentStatus === 'WRAP_UP') {
               const lastSeen = Number(agent?.lastSeenAt || 0);
               const wrapUpAge = now - lastSeen;
               if (wrapUpAge < WRAPUP_MAX_AGE_MS) return; // still within timeout
               console.log(`[evictStaleActiveCalls] ⏰ WRAP_UP timeout (${Math.round(wrapUpAge / 1000)}s) for agent: ${agentId} — force-releasing`);
               // Release back to pool so they can go live again
               await Promise.all([
                  redisClient.hDel('activecalls:data', agentId),
                  redisClient.sRem('agents:busy', agentId),
                  redisClient.sRem('agents:ringing', agentId),
               ]);
               if (agent?.campaignId) {
                  await redisClient.zAdd(this.poolKey(agent.campaignId), { score: Date.now(), value: agentId });
               }
               if (agent) {
                  agent.status = 'AVAILABLE';
                  agent.lastSeenAt = now.toString();
                  await redisClient.hSet('agents:data', agentId, JSON.stringify(agent));
               }
               evicted += 1;
               this.markDiagnostic('ghostEvicted');
               return;
            }

            // ── Check 2: Zombie IN_CALL — heartbeat alive but call too long ──
            // If a heartbeat exists but the call has been running for > INCALL_MAX_AGE_MS
            // (e.g. 90 min), this is almost certainly a ghost (webhook delivery failed).
            if (hb) {
               let callRow = null;
               try { callRow = JSON.parse(allCalls[agentId]); } catch { /* skip */ }
               const startedAt = callRow?.startedAt ? new Date(callRow.startedAt).getTime() : 0;
               if (startedAt > 0 && (now - startedAt) > INCALL_MAX_AGE_MS) {
                  console.log(`[evictStaleActiveCalls] 🧟 Zombie IN_CALL (>${Math.round(INCALL_MAX_AGE_MS / 60000)}min) for agent: ${agentId} — force-releasing`);
                  await Promise.all([
                     redisClient.hDel('activecalls:data', agentId),
                     redisClient.sRem('agents:busy', agentId),
                     redisClient.sRem('agents:ringing', agentId),
                  ]);
                  if (agent?.campaignId) {
                     await redisClient.zAdd(this.poolKey(agent.campaignId), { score: Date.now(), value: agentId });
                  }
                  if (agent) {
                     agent.status = 'AVAILABLE';
                     agent.lastSeenAt = now.toString();
                     await redisClient.hSet('agents:data', agentId, JSON.stringify(agent));
                  }
                  evicted += 1;
                  this.markDiagnostic('ghostEvicted');
               }
               return; // heartbeat alive and not zombie — skip
            }

            // ── Check 3: No heartbeat + not WRAP_UP → immediate ghost ─────────
            await Promise.all([
               redisClient.hDel('activecalls:data', agentId),
               redisClient.sRem('agents:busy', agentId),
               redisClient.sRem('agents:ringing', agentId),
               redisClient.hDel('agents:data', agentId),
               redisClient.zRem('agents:heartbeats', agentId),
            ]);
            console.log(`[evictStaleActiveCalls] 🧹 Evicted ghost (no heartbeat) from activecalls:data: ${agentId}`);
            evicted += 1;
            this.markDiagnostic('ghostEvicted');
         })
      );
      return evicted;
   }

   /**
    * Admin force-release: immediately clears an agent's call state and puts them
    * back into the available pool (or fully removes them if they have no agent data).
    * Used by the admin dashboard "Force Remove" button to fix ghost states.
    */
   async forceReleaseAgent(agentId) {
      const dataStr = await redisClient.hGet('agents:data', agentId);
      const data = dataStr ? JSON.parse(dataStr) : null;

      await Promise.all([
         redisClient.hDel('activecalls:data', agentId),
         redisClient.sRem('agents:busy', agentId),
         redisClient.sRem('agents:ringing', agentId),
      ]);

      if (data) {
         data.status = 'AVAILABLE';
         data.lastSeenAt = Date.now().toString();
         await redisClient.hSet('agents:data', agentId, JSON.stringify(data));
         if (data.campaignId) {
            await redisClient.zAdd(this.poolKey(data.campaignId), { score: Date.now(), value: agentId });
         }
         console.log(`[Admin] 🔓 Force-released agent ${agentId} → AVAILABLE`);
         return { action: 'released', agentId };
      }

      // No agent data at all — full remove
      await Promise.all([
         redisClient.hDel('agents:data', agentId),
         redisClient.del(`agent:heartbeat:${agentId}`),
         redisClient.zRem('agents:heartbeats', agentId),
      ]);
      console.log(`[Admin] ❌ Force-removed ghost agent ${agentId} (no agent data found)`);
      return { action: 'removed', agentId };
   }
}

module.exports = new AgentManager();
