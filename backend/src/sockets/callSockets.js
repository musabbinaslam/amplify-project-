const agentManager = require('../services/agentManager');
const { redisClient } = require('../config/redis');
const { getBalance } = require('../services/walletService');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const socketRegistry = require('./socketRegistry');
const { isCampaignPaused } = require('../services/notificationService');
const { getUserDoc } = require('../services/userDataService');
const { validateAgentCampaignAccess } = require('../services/campaignAccessService');
const { normalizeAgencyId } = require('../utils/tenancy');

const HEARTBEAT_TTL_SECONDS = 35;

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
            socketRegistry.joinAgent(socket, uid);
        });

        socket.on('notification:unregister', () => {
            if (!socket.notificationUid) return;
            socketRegistry.leaveAgent(socket, socket.notificationUid);
            socket.notificationUid = null;
        });

        socket.on('agent:go_live', async (payload) => {
            const { agentId, campaign, sessionId } = payload;
            const identity = agentId || socket.id;
            const safeSessionId = String(sessionId || `${identity}-${Date.now()}`).trim();

            try {
                const userDoc = await getUserDoc(identity);
                const accessError = await validateAgentCampaignAccess(userDoc?.agencyId, campaign);
                if (accessError) {
                    socket.emit('agent:go_live_error', {
                        code: 'CAMPAIGN_FORBIDDEN',
                        message: accessError,
                    });
                    return;
                }
            } catch (err) {
                console.warn(`[Agency] Campaign access check failed for ${identity}:`, err.message);
            }

            try {
                if (await isCampaignPaused(campaign)) {
                    socket.emit('agent:go_live_error', {
                        code: 'CAMPAIGN_PAUSED',
                        message: 'This campaign is temporarily paused by admin. Please select another campaign.',
                    });
                    return;
                }
            } catch (err) {
                console.warn(`[CampaignControls] Failed pause check for ${campaign}:`, err.message);
            }

            // ── Balance Gate ─────────────────────────────────────────────────
            try {
                const balanceCents = await getBalance(identity);
                const campaignPriceCents = CAMPAIGN_CONFIG[campaign] ? CAMPAIGN_CONFIG[campaign].price * 100 : 0;
                
                if (balanceCents < campaignPriceCents) {
                    console.log(`[Wallet] 🚫 Agent ${identity} blocked from going live — insufficient balance (has $${(balanceCents / 100).toFixed(2)}, needs $${(campaignPriceCents / 100).toFixed(2)})`);
                    socket.emit('agent:go_live_error', {
                        code: 'INSUFFICIENT_BALANCE',
                        message: `Your wallet balance ($${(balanceCents / 100).toFixed(2)}) is insufficient to take calls for this campaign (requires $${(campaignPriceCents / 100).toFixed(2)}). Please add credits before going live.`,
                        balance: balanceCents,
                    });
                    return;
                }
            } catch (err) {
                console.error(`[Wallet] Balance check failed for ${identity} — allowing through:`, err.message);
            }

            // Store session on socket — do NOT add to pool yet.
            // The frontend will emit agent:pool_ready AFTER the Twilio Device
            // is fully registered, preventing "Failed" outgoing dials.
            socket.agentId = identity;
            socket.agentSessionId = safeSessionId;
            socket.pendingGoLivePayload = { ...payload, sessionId: safeSessionId };

            // Join agent room so targeted emits work while device is initialising (multi-node safe)
            socketRegistry.joinAgent(socket, identity);

            // Acknowledge session — frontend proceeds to register Twilio Device
            socket.emit('agent:live_pending', {
                status: 'PENDING',
                identity,
                sessionId: safeSessionId,
            });
        });

        // ── Stage 2: Device is registered with Twilio — NOW enter the pool ──
        socket.on('agent:pool_ready', async () => {
            const payload = socket.pendingGoLivePayload;
            if (!payload || !socket.agentId) {
                // Ignore spurious events (e.g. double-fire)
                return;
            }
            try {
                if (await isCampaignPaused(payload.campaign)) {
                    socket.pendingGoLivePayload = null;
                    socket.emit('agent:go_live_error', {
                        code: 'CAMPAIGN_PAUSED',
                        message: 'This campaign was paused by admin. Please select another campaign.',
                    });
                    return;
                }
            } catch (err) {
                console.warn(`[CampaignControls] Failed pool_ready pause check for ${payload.campaign}:`, err.message);
            }
            socket.pendingGoLivePayload = null; // consume

            // Use agencyId from the go_live payload (sent by frontend from authStore).
            // Fall back to a Firestore lookup only if the frontend didn't send it.
            let agencyId = normalizeAgencyId(payload.agencyId);
            if (!agencyId) {
                try {
                    const userDoc = await getUserDoc(socket.agentId);
                    agencyId = normalizeAgencyId(userDoc?.agencyId);
                } catch {
                    agencyId = null;
                }
            }
            console.log(`[Socket] Agent ${socket.agentId} pool_ready — agencyId=${agencyId || 'platform'}`);

            const registered = await agentManager.registerAgent(socket.agentId, {
                ...payload,
                agencyId,
            });

            // Update session ID from registrar (may have been normalised)
            socket.agentSessionId = registered?.sessionId || socket.agentSessionId;

            // Set initial heartbeat TTL
            await redisClient.setEx(
                `agent:heartbeat:${socket.agentId}`,
                HEARTBEAT_TTL_SECONDS,
                socket.agentSessionId,
            );
            await agentManager.setVoiceReady(
                socket.agentId,
                socket.agentSessionId,
                HEARTBEAT_TTL_SECONDS,
            );

            socket.emit('agent:live_confirmed', {
                status: 'AVAILABLE',
                identity: socket.agentId,
                sessionId: socket.agentSessionId,
            });
            await broadcastAgentCount(io);
            console.log(`[Socket] ✅ Agent ${socket.agentId} entered pool after device:registered`);
        });



        const handleCallDelivered = async (payload = {}) => {
            const agentId = String(payload.agentId || socket.agentId || '').trim();
            if (!agentId) return;
            try {
                await agentManager.confirmCallDelivered(agentId, {
                    callSid: payload.callSid,
                    from: payload.from,
                    to: payload.to,
                    campaignId: payload.campaignId,
                });
            } catch (e) {
                console.warn('[Socket] call delivery confirm failed:', e.message);
            }
        };

        socket.on('agent:call_incoming', handleCallDelivered);
        socket.on('agent:call_accepted', handleCallDelivered);

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
                } else if (out?.ok) {
                    await agentManager.setVoiceReady(
                        identity,
                        out.sessionId || socket.agentSessionId,
                        HEARTBEAT_TTL_SECONDS,
                    );
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

        // Browser-initiated WRAP_UP: fires the moment the call disconnects on the
        // agent's device — well before the Twilio webhook reaches the server.
        // Removes the agent from the routing pool immediately so no new call can
        // be routed to them while they are filling in the disposition form.
        // The Twilio webhook will call setAgentWrapUp again later (idempotent).
        socket.on('agent:wrap_up', async (payload = {}) => {
            if (socket.agentId) {
                const expectedSession = String(payload?.sessionId || socket.agentSessionId || '').trim() || null;
                const agentState = await agentManager.getAgentState(socket.agentId);
                if (expectedSession && agentState?.sessionId && agentState.sessionId !== expectedSession) {
                    console.log(`[Socket] Ignoring agent:wrap_up for ${socket.agentId} — session mismatch`);
                    return;
                }
                await agentManager.setAgentWrapUp(socket.agentId);
                console.log(`[Socket] ⚡ Agent ${socket.agentId} entered WRAP_UP via browser disconnect (fast path)`);
                await broadcastAgentCount(io);
            }
        });

        // Explicit go-offline (agent clicks "Go Offline" without closing the browser)
        // Removes them from the pool immediately rather than waiting for disconnect/heartbeat expiry
        socket.on('agent:go_offline', async (payload = {}) => {
            if (socket.agentId) {
                const expectedSession = String(payload?.sessionId || socket.agentSessionId || '').trim() || null;
                await agentManager.removeAgent(socket.agentId, expectedSession);
                socket.agentId = null;
                socket.agentSessionId = null;
                await broadcastAgentCount(io);
                console.log(`[Socket] Agent went offline explicitly`);
            }
        });

        socket.on('disconnect', async () => {
            // Rooms are left automatically on disconnect — no leaveAgent needed.
            if (socket.agentId) {
                await agentManager.removeAgent(socket.agentId, socket.agentSessionId || null);
            }
            socket.notificationUid = null;
            socket.agentSessionId = null;
            await broadcastAgentCount(io);
            console.log(`❌ WebRTC Socket Disconnected: ${socket.id}`);
        });
    });
};
