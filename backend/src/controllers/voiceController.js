const twilio = require('twilio');
const { VoiceGrant, TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = require('../config/twilio');
const { VoiceResponse } = twilio.twiml;
const agentManager = require('../services/agentManager');
const callLogService = require('../services/callLogService');
const phoneRouteService = require('../services/phoneRouteService');
const { dispatchQaInsightJob } = require('../queues/qaQueue');

exports.generateToken = (req, res) => {
  const { identity } = req.body;
  
  if (!identity) {
    return res.status(400).json({ error: 'identity is required' });
  }
  const normalizedIdentity = String(identity).trim();
  if (!/^[a-zA-Z0-9:_-]{3,128}$/.test(normalizedIdentity)) {
    return res.status(400).json({ error: 'identity format is invalid' });
  }
  if (req.user?.uid && normalizedIdentity !== req.user.uid) {
    return res.status(403).json({ error: 'identity must match authenticated user' });
  }

  // Create an access token
  const token = new twilio.jwt.AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    { identity: normalizedIdentity }
  );

  // Grant access to Voice using our TwiML App
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    incomingAllow: true // Critical: Allows React to RECEIVE calls
  });

  token.addGrant(voiceGrant);

  // Serialize the token to a JWT string
  res.json({ token: token.toJwt(), identity: normalizedIdentity });
};

exports.handleIncomingCall = async (req, res) => {
  const twiml = new VoiceResponse();
  
  // Safe extraction to prevent crashes
  const fromNumber = (req.body && req.body.From) || 'Unknown Caller';
  let callerState = (req.body && req.body.FromState) || null; // fallback to Twilio Area Code State
  const queryCampaign = req.query && req.query.campaign;
  const bodyCampaign = req.body && req.body.campaign;
  let campaign = queryCampaign || bodyCampaign;
  const toNumber = req.body && req.body.To;
  // retryCount tracks how many re-routing attempts have been made for this call.
  // Passed as a query param from the Redirect TwiML in handleCallCompleted.
  const retryCount = Math.min(Number(req.query.retryCount || 0), 5);
  
  
  if (!campaign && toNumber) {
    try {
      const mapped = await phoneRouteService.getCampaignByToNumber(toNumber);
      if (mapped) campaign = mapped;
    } catch (e) {
      console.warn('[Twilio Webhook] phone route lookup failed:', e.message);
    }
  }
  if (!campaign) campaign = 'fe_transfers';

  console.log(`[Twilio Webhook] 🔔 Incoming call from: ${fromNumber} | Guaranteed Area Code State Lookup: ${callerState || 'Unknown'} | To: ${toNumber}`);
  console.log(`[Twilio Webhook] 🎯 Resolved Campaign: ${campaign}`);

  try {
     const available = await agentManager.findAndLockAvailableAgent(campaign, callerState);

     if (available) {
        const parentCallSid = req.body?.CallSid || req.body?.CallSidInbound || '';
        // Stay RINGING until the browser receives the Twilio leg (agent:call_incoming).
        // Marking IN_CALL/busy before dial caused ghosts when 2+ agents were online.
        await agentManager.markAgentDialing(available.id, {
          callSid: parentCallSid,
          from: fromNumber,
          to: toNumber,
          campaignId: campaign,
          startedAt: new Date().toISOString(),
          retryCount,
        });
        const dial = twiml.dial({
          action: `/api/voice/call-completed?campaign=${campaign}&agentId=${available.id}&retryCount=${retryCount}`,
          method: 'POST',
          timeout: 20,
          answerOnBridge: true,
          record: 'record-from-answer'
        });
        
        dial.client(available.id);
     } else {
        if (retryCount === 0) {
          // First attempt: no agents available at all
          twiml.say('All agents are currently assisting other callers. Please try again shortly.');
        } else {
          // Retry attempt: all re-routes also failed
          twiml.say('We were unable to connect your call. Please try again.');
        }
        twiml.hangup();
     }
  } catch(error) {
     console.error('Routing Error:', error);
     twiml.say('An error occurred in the routing logic.');
     twiml.hangup();
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
};

/**
 * Handle call completion metadata from Twilio.
 *
 * DialCallStatus values from Twilio:
 *   'completed'  → agent answered and call ended normally
 *   'busy'       → agent rejected the call via .reject()
 *   'no-answer'  → agent didn't pick up within the timeout
 *   'cancel'     → caller hung up before agent answered
 *   'failed'     → Twilio could not reach the client endpoint
 */
exports.handleCallCompleted = async (req, res) => {
    const { campaign, agentId } = req.query;
    // retryCount: number of re-routing attempts already made for this call leg
    const retryCount = Math.min(Number(req.query.retryCount || 0), 5);
    const { From, To, DialCallDuration, DialCallStatus, DialCallSid, CallSid, FromState, RecordingUrl } = req.body;

    // ── Immediate re-routing decision ───────────────────────────────────────
    // If the agent dial failed, wasn't answered, or agent rejected the call,
    // AND the caller is still on the line (not cancel), AND we have retries left,
    // immediately redirect to try the next available agent.
    const isRerouteable = ['failed', 'no-answer', 'busy'].includes(DialCallStatus);
    const callerHungUp  = DialCallStatus === 'cancel';
    const MAX_RETRIES   = 2; // maximum re-routing hops per call

    if (isRerouteable && !callerHungUp && retryCount < MAX_RETRIES) {
        // Release the agent that just failed/missed so they go back to AVAILABLE
        if (agentId) {
            try {
                await agentManager.clearActiveCall(agentId);
                const agentState = await agentManager.getAgentState(agentId);
                await agentManager.releaseAgent(agentId, agentState?.sessionId || null);
            } catch (e) {
                console.warn('[Router] Re-route release failed:', e.message);
            }
        }
        const nextRetry = retryCount + 1;
        const fromState = FromState || '';
        const redirectUrl = `/api/voice/incoming-call?campaign=${campaign}&retryCount=${nextRetry}${fromState ? `&FromState=${fromState}` : ''}`;
        console.log(`[Router] 🔁 Re-routing call (attempt ${nextRetry}/${MAX_RETRIES}) — DialCallStatus: ${DialCallStatus} | CallSid: ${CallSid}`);
        const rerouteTwiml = new VoiceResponse();
        rerouteTwiml.redirect({ method: 'POST' }, redirectUrl);
        res.set('Content-Type', 'text/xml');
        return res.send(rerouteTwiml.toString());
    }


    const isRejectedOrMissed = ['busy', 'no-answer', 'failed', 'cancel'].includes(DialCallStatus);

    console.log(`[Twilio] Call Completed: ${CallSid}. DialSid: ${DialCallSid}. Duration: ${DialCallDuration}s. Status: ${DialCallStatus}${isRejectedOrMissed ? ' (agent rejected/missed)' : ''}. Recording: ${RecordingUrl ? 'Yes' : 'No'}`);

    let savedLog = null;
    let resolvedAgentId = agentId || null;

    // Extract the Recording SID from the RecordingUrl for clean frontend access.
    // Twilio RecordingUrl format: https://api.twilio.com/.../Recordings/RExxxxxx[.json]
    let recordingSid = null;
    if (RecordingUrl) {
        const sidMatch = String(RecordingUrl).match(/(RE[0-9a-fA-F]{32})/);
        recordingSid = sidMatch ? sidMatch[1] : null;
    }

    try {
        if (!resolvedAgentId && CallSid) {
            resolvedAgentId = await agentManager.findAgentIdByCallSid(CallSid);
        }
        savedLog = await callLogService.logCall({
            from: From,
            to: To,
            duration: DialCallDuration,
            campaignId: campaign,
            agentId: resolvedAgentId,
            status: DialCallStatus === 'completed' ? 'completed' : 'missed',
            callSid: CallSid,
            dialCallSid: DialCallSid || null,
            recordingUrl: RecordingUrl || null,
            recordingSid: recordingSid || null,
        });
    } catch (err) {
        console.error('[Twilio] Failed to persist call log:', err.message);
    } finally {
      if (resolvedAgentId) {
        try {
            const activeRow = await agentManager.getActiveCall(resolvedAgentId);
            if (activeRow?.callSid && CallSid && String(activeRow.callSid) !== String(CallSid)) {
                console.warn(
                  `[Router] Skip stale completion release for ${resolvedAgentId}: callback sid ${CallSid} != active sid ${activeRow.callSid}`,
                );
            } else {
                if (DialCallStatus === 'completed') {
                    // Fallback if browser never emitted agent:call_incoming before hangup.
                    if (!(await agentManager.getActiveCall(resolvedAgentId))) {
                        await agentManager.upsertActiveCall(resolvedAgentId, {
                            callSid: CallSid,
                            from: From,
                            to: To,
                            campaignId: campaign,
                            startedAt: new Date().toISOString(),
                            state: 'in_call',
                        });
                    }
                    await agentManager.setAgentWrapUp(resolvedAgentId);
                } else {
                    // Call missed/failed/cancelled. Release immediately.
                    await agentManager.clearActiveCall(resolvedAgentId);
                    const agentState = await agentManager.getAgentState(resolvedAgentId);
                    await agentManager.releaseAgent(resolvedAgentId, agentState?.sessionId || null);
                }
            }
        } catch (e) {
            console.warn('[Router] release/wrapup after completion failed:', e.message);
        }
      } else if (CallSid) {
        // resolvedAgentId is still null (agentId param was missing AND no activecall record
        // matched this CallSid). Scan activecalls:data as a last-resort safety net so we
        // never leave a ghost record behind.
        try {
            const fallbackAgentId = await agentManager.findAgentIdByCallSid(CallSid);
            if (fallbackAgentId) {
                console.warn(`[Router] resolvedAgentId was null — fallback cleared ghost for agent ${fallbackAgentId} via CallSid ${CallSid}`);
                await agentManager.clearActiveCall(fallbackAgentId);
                const agentState = await agentManager.getAgentState(fallbackAgentId);
                await agentManager.releaseAgent(fallbackAgentId, agentState?.sessionId || null);
            }
        } catch (e) {
            console.warn('[Router] fallback ghost-clear failed:', e.message);
        }
      }
    }

    // Non-blocking QA insight generation — runs in-process with exponential backoff retries.
    // Dispatched AFTER the HTTP response is already sent, so call handling is never delayed.
    if (resolvedAgentId && savedLog?.id && !isRejectedOrMissed) {
        dispatchQaInsightJob({
            savedLog,
            agentId: resolvedAgentId,
            FromState: FromState || null,
        });
        console.log(`[Twilio] QA Insight dispatched (async) for Call ${savedLog.id}`);
    }

    // ── Referral Stage 3: Check if this agent just "went live" ──────────────
    // "Goes live" = first completed call with duration ≥ 30 seconds
    if (resolvedAgentId && savedLog?.status === 'completed' && Number(savedLog?.duration || 0) >= 30) {
        try {
            const referralService = require('../services/referralService');
            await referralService.advanceToLive(resolvedAgentId);
        } catch (err) {
            console.warn('[Referral] Stage 3 advance failed (non-blocking):', err.message);
        }
    }

    // IMPORTANT: Always return <Hangup/> so Twilio terminates the caller leg.
    // Without this, rejected/no-answer calls can loop back and re-ring the agent.
    const twiml = new VoiceResponse();
    twiml.hangup();
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
};

/**
 * Get call history logs for the authenticated user
 */
exports.getLogs = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 500), 1000);
        let startDate = null;
        let endDate = null;
        if (req.query.startDate) startDate = new Date(req.query.startDate);
        if (req.query.endDate) endDate = new Date(req.query.endDate);

        const logs = await callLogService.getLogsByUser(req.user.uid, limit, startDate, endDate);
        res.json(logs);
    } catch (err) {
        console.error('[Voice] getLogs error:', err.message);
        res.status(500).json({ error: 'Failed to load call logs' });
    }
};

/**
 * Proxy a Twilio recording so the browser doesn't need to authenticate directly.
 * Supports HTTP Range requests for instant playback and audio scrubbing.
 */
exports.proxyRecording = async (req, res) => {
    const rawRecordingSid = String(req.params.recordingSid || '');
    const sidMatch = rawRecordingSid.match(/(RE[0-9a-fA-F]{32})/);
    const recordingSid = sidMatch?.[1] || rawRecordingSid.replace(/\.(json|mp3)$/i, '');

    if (!recordingSid) {
        return res.status(400).json({ error: 'Recording SID is required' });
    }

    try {
        console.log(`[Proxy] Streaming recording: ${recordingSid}`);
        
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${recordingSid}.mp3`;
        const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

        // Forward Range header from browser if present (enables scrubbing)
        const rangeHeader = req.headers['range'];
        const upstreamHeaders = { 'Authorization': authHeader };
        if (rangeHeader) {
            upstreamHeaders['Range'] = rangeHeader;
        }

        // Intercept redirect to prevent forwarding Twilio Basic Auth to AWS S3 (which causes a 400 Bad Request)
        let response = await fetch(twilioUrl, { 
            headers: upstreamHeaders,
            redirect: 'manual'
        });

        if (response.status === 302 || response.status === 307) {
            const redirectUrl = response.headers.get('location');
            if (!redirectUrl) throw new Error('Twilio redirect missing location header');
            
            // Re-fetch from the S3 URL using ONLY the Range header
            const s3Headers = rangeHeader ? { 'Range': rangeHeader } : {};
            response = await fetch(redirectUrl, { headers: s3Headers });
        }

        if (!response.ok && response.status !== 206) {
            throw new Error(`Twilio/S3 returned ${response.status}`);
        }

        // Pass through upstream metadata so the browser can parse duration/scrub correctly.
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');
        const contentType = response.headers.get('content-type') || 'audio/mpeg';

        // Preserve actual upstream status. Some CDNs ignore Range and still return 200.
        // Forcing 206 without Content-Range can make players show 0:00 and fail playback.
        const statusCode = response.status === 206 ? 206 : 200;

        const resHeaders = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=3600',
        };
        if (contentLength) resHeaders['Content-Length'] = contentLength;
        if (contentRange)  resHeaders['Content-Range']  = contentRange;

        res.writeHead(statusCode, resHeaders);

        // Pipe the stream directly — no buffering, instant playback
        const { Readable } = require('stream');
        Readable.fromWeb(response.body).pipe(res);

    } catch (err) {
        console.error(`[Proxy] Failed to stream recording ${recordingSid}:`, err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to load recording' });
        }
    }
};

/**
 * Update call log (e.g., disposition)
 */
exports.updateCallLog = async (req, res) => {
    try {
        const { callSid } = req.params;
        const { disposition } = req.body;
        const uid = req.user.uid;

        if (!callSid || !disposition) {
            return res.status(400).json({ error: 'callSid and disposition are required' });
        }

        // 1. Update Firestore
        const success = await callLogService.updateCallLogBySid(uid, callSid, { disposition });
        if (!success) {
            return res.status(404).json({ error: 'Call log not found or failed to update' });
        }

        // 2. Release agent back into the pool (end of WRAP_UP phase)
        await agentManager.clearActiveCall(uid);
        const agentState = await agentManager.getAgentState(uid);
        if (agentState) {
            await agentManager.releaseAgent(uid, agentState.sessionId || null);
        }

        res.json({ success: true, message: 'Disposition saved' });
    } catch (err) {
        console.error('[Voice] updateCallLog error:', err.message);
        res.status(500).json({ error: 'Failed to update call log' });
    }
};
