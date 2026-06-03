const twilio = require('twilio');
const { VoiceGrant, TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = require('../config/twilio');
const { VoiceResponse } = twilio.twiml;
const agentManager = require('../services/agentManager');
const callLogService = require('../services/callLogService');
const callContestService = require('../services/callContestService');
const contestProofStorage = require('../services/contestProofStorage');
const { getUserDoc } = require('../services/userDataService');
const phoneRouteService = require('../services/phoneRouteService');
const { normalizeCallerState } = require('../utils/phoneUtils');
const { dispatchQaInsightJob } = require('../queues/qaQueue');
const twilioClientObj = require('../config/twilio').twilioClient;
const { redisClient } = require('../config/redis');

/** Absolute URL for Twilio webhooks (relative URLs break statusCallback on some hosts). */
function voiceWebhookUrl(req, pathWithQuery) {
  const configured = String(process.env.VOICE_WEBHOOK_BASE_URL || process.env.API_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return `${configured}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`;
}

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
  
  const fromNumber = (req.body && req.body.From) || 'Unknown Caller';
  let callerState = normalizeCallerState(req.body?.FromState, fromNumber);
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
        if (parentCallSid) {
          await agentManager.releaseStaleRingingForCall(parentCallSid, available.id);
        }
        const dialStatusQs = new URLSearchParams({
          campaign: String(campaign),
          agentId: String(available.id),
          retryCount: String(retryCount),
          parentCallSid: String(parentCallSid),
        });
        const completedQs = new URLSearchParams({
          campaign: String(campaign),
          agentId: String(available.id),
          retryCount: String(retryCount),
        });

        if (campaign === 'aca_transfers') {
          // ── ACA Transfers: Conference-From-Start Routing ──
          const confName = `aca_conf_${parentCallSid}`;
          
          const dial = twiml.dial({
            action: voiceWebhookUrl(req, `/api/voice/call-completed?${completedQs.toString()}`),
            method: 'POST',
            record: 'record-from-start',
          });
          dial.conference({
            startConferenceOnEnter: false,
            endConferenceOnExit: true, // Caller hangup ends the conference
            waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
            beep: false,
            record: 'record-from-start'
          }, confName);

          // Store conference mapping so transfer API can find it
          await redisClient.setEx(`aca:conf:${available.id}`, 3600, confName);

          const fromNum = process.env.TWILIO_ACA_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+10000000000';
          dialStatusQs.set('isOutboundAgent', 'true'); // Flag to handle retries on REST failure
          
          twilioClientObj.calls.create({
            to: `client:${available.id}`,
            from: fromNum,
            timeout: 20, // 20s ring time
            statusCallback: voiceWebhookUrl(req, `/api/voice/dial-status?${dialStatusQs.toString()}`),
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallbackMethod: 'POST',
            twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${confName}</Conference></Dial></Response>`
          }).catch(err => console.error('[Twilio] Failed to dial agent for ACA conference:', err.message));

        } else {
          // ── All other campaigns: Direct Client Dial ──
          const dial = twiml.dial({
            action: voiceWebhookUrl(req, `/api/voice/call-completed?${completedQs.toString()}`),
            method: 'POST',
            timeout: 20,
            answerOnBridge: true,
            record: 'record-from-answer',
            // Server-side promotion to IN_CALL when Twilio bridges the client leg.
            statusCallback: voiceWebhookUrl(req, `/api/voice/dial-status?${dialStatusQs.toString()}`),
            statusCallbackEvent: 'initiated ringing answered completed',
            statusCallbackMethod: 'POST',
          });
          
          dial.client(available.id);
        }
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
 * Twilio Dial statusCallback — promotes agent to IN_CALL when the client leg is answered.
 * Without this, agents stay in Redis RINGING if the browser socket never emits call_incoming.
 */
exports.handleDialStatus = async (req, res) => {
  const { campaign, agentId } = req.query;
  const event = String(req.body.StatusCallbackEvent || '').toLowerCase();
  const callStatus = String(req.body.CallStatus || '').toLowerCase();
  const callSid = String(req.body.CallSid || req.query.parentCallSid || '').trim();

  if (!agentId) {
    return res.sendStatus(200);
  }

  const parentSid = String(req.query.parentCallSid || callSid || '').trim();
  const ownerId = parentSid
    ? await agentManager.resolveCallOwner(parentSid, agentId)
    : agentId;

  console.log(
    `[Twilio] Dial status: agent=${agentId} owner=${ownerId || 'n/a'} event=${event || 'n/a'} callStatus=${callStatus || 'n/a'} sid=${callSid || 'n/a'}`,
  );

  if (parentSid && ownerId && ownerId !== agentId) {
    console.warn(`[Twilio] Dial status ignored for ${agentId} — call:route owner is ${ownerId}`);
    return res.sendStatus(200);
  }

  if (parentSid && !(await agentManager.wasDialedForCall(agentId, parentSid))) {
    console.warn(`[Twilio] Dial status ignored for ${agentId} — not dialed for ${parentSid}`);
    return res.sendStatus(200);
  }

  try {
    const isAnswered =
      event === 'answered' ||
      callStatus === 'in-progress' ||
      callStatus === 'answered';

    if (isAnswered) {
      await agentManager.confirmCallDelivered(agentId, {
        callSid,
        parentCallSid: parentSid !== callSid ? parentSid : null,
        from: req.body.From,
        to: req.body.To,
        campaignId: campaign,
      });
    } else {
      const terminal =
        ['completed', 'busy', 'no-answer', 'failed', 'canceled', 'cancelled'].includes(event) ||
        ['busy', 'no-answer', 'failed', 'canceled', 'cancelled'].includes(callStatus);
      if (terminal) {
        const active = await agentManager.getActiveCall(agentId);
        if (!active) {
          await agentManager.clearActiveCall(agentId);
          const agentState = await agentManager.getAgentState(agentId);
          await agentManager.releaseAgent(agentId, agentState?.sessionId || null);
          console.log(`[Twilio] Dial status released agent ${agentId} (${event || callStatus}) — never bridged`);
          
          // If this was an ACA outbound agent leg that failed, reroute the waiting caller
          if (req.query.isOutboundAgent === 'true' && parentSid) {
             const retryCount = Number(req.query.retryCount || 0);
             if (retryCount < 2) {
               const nextRetry = retryCount + 1;
               const redirectQs = new URLSearchParams({ campaign: String(campaign || ''), retryCount: String(nextRetry) });
               const redirectUrl = voiceWebhookUrl(req, `/api/voice/incoming-call?${redirectQs.toString()}`);
               await twilioClientObj.calls(parentSid).update({
                   method: 'POST',
                   url: redirectUrl
               }).catch(err => console.warn('[Router] Failed to redirect parent call for ACA retry:', err.message));
             } else {
               await twilioClientObj.calls(parentSid).update({
                   twiml: '<Response><Say>All agents are currently assisting other callers. Please try again shortly.</Say><Hangup/></Response>'
               }).catch(err => console.warn('[Router] Failed to hangup parent call for ACA:', err.message));
             }
          }
        } else {
          // Agent was IN_CALL but their leg terminated (e.g. they clicked "Leave Transfer" or hung up their phone).
          // Release them to WRAP_UP so they can take new calls, without killing the customer's parent call.
          console.log(`[Twilio] Agent ${agentId} leg terminated (${event || callStatus}). Moving to wrap-up.`);
          await agentManager.setAgentWrapUp(agentId);
        }
      }
    }
  } catch (err) {
    console.warn('[Twilio] handleDialStatus:', err.message);
  }

  return res.sendStatus(200);
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
        const redirectQs = new URLSearchParams({
          campaign: String(campaign || ''),
          retryCount: String(nextRetry),
        });
        if (fromState) redirectQs.set('FromState', fromState);
        const redirectUrl = voiceWebhookUrl(req, `/api/voice/incoming-call?${redirectQs.toString()}`);
        console.log(`[Router] 🔁 Re-routing call (attempt ${nextRetry}/${MAX_RETRIES}) — DialCallStatus: ${DialCallStatus} | CallSid: ${CallSid}`);
        const rerouteTwiml = new VoiceResponse();
        rerouteTwiml.redirect({ method: 'POST' }, redirectUrl);
        res.set('Content-Type', 'text/xml');
        return res.send(rerouteTwiml.toString());
    }


    const isRejectedOrMissed = ['busy', 'no-answer', 'failed', 'cancel'].includes(DialCallStatus);

    console.log(`[Twilio] Call Completed: ${CallSid}. DialSid: ${DialCallSid}. Duration: ${DialCallDuration}s. Status: ${DialCallStatus}${isRejectedOrMissed ? ' (agent rejected/missed)' : ''}. Recording: ${RecordingUrl ? 'Yes' : 'No'}`);

    let savedLog = null;
    let resolvedAgentId = await agentManager.resolveCallOwner(CallSid, agentId);

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
        const shouldLog = resolvedAgentId
          && CallSid
          && (await agentManager.wasDialedForCall(resolvedAgentId, CallSid));
        if (resolvedAgentId && CallSid && !shouldLog) {
            console.warn(
              `[Twilio] Skip call log for ${resolvedAgentId} — never dialed for ${CallSid} (phantom missed)`,
            );
            await agentManager.releaseStaleRingingForCall(CallSid, null);
            resolvedAgentId = null;
        } else if (resolvedAgentId) {
            let computedDuration = 0;
            try {
                const activeRow = await agentManager.getActiveCall(resolvedAgentId);
                if (activeRow && activeRow.startedAt) {
                    const startMs = new Date(activeRow.startedAt).getTime();
                    if (Date.now() > startMs) {
                        computedDuration = Math.round((Date.now() - startMs) / 1000);
                    }
                }
            } catch (e) {
                console.warn('[Router] Failed to compute duration fallback:', e.message);
            }

            // For conference calls or forcefully killed calls, Twilio might omit duration.
            let effectiveDuration = DialCallDuration || req.body.CallDuration || computedDuration || 0;
            
            // If we still have 0 duration but the call theoretically completed, fetch true duration from Twilio API directly
            if (Number(effectiveDuration) === 0 && CallSid) {
                try {
                    const twilioCall = await twilioClientObj.calls(CallSid).fetch();
                    if (twilioCall && twilioCall.duration) {
                        effectiveDuration = twilioCall.duration;
                        console.log(`[Twilio] Fetched true duration from REST API for ${CallSid}: ${effectiveDuration}s`);
                    }
                } catch (apiErr) {
                    console.warn(`[Twilio] Failed to fetch true duration from API for ${CallSid}:`, apiErr.message);
                }
            }
            
            // For conference calls or forcefully killed calls, DialCallStatus might be 'canceled' or missing.
            // If there's any duration > 0, it means the call was bridged, so it's completed (not missed).
            const effectiveStatus = (DialCallStatus === 'completed' || Number(effectiveDuration) > 0) ? 'completed' : 'missed';
            
            let finalRecordingUrl = RecordingUrl || null;
            
            // Wait slightly and attempt to fetch the conference recording if it's missing (for ACA transfers)
            if (!finalRecordingUrl && effectiveDuration > 0 && campaign === 'aca_transfers') {
                setTimeout(async () => {
                    try {
                        const recordings = await twilioClientObj.recordings.list({ callSid: CallSid, limit: 1 });
                        if (recordings && recordings.length > 0) {
                            const recUrl = `https://api.twilio.com${recordings[0].uri.replace('.json', '.mp3')}`;
                            await callLogService.updateCallLogBySid(resolvedAgentId, [CallSid], { recordingUrl: recUrl });
                        }
                    } catch (e) {
                        console.error('[Twilio] Failed to fetch conference recording in background:', e.message);
                    }
                }, 8000); // Wait 8 seconds to allow Twilio to finish processing
            }

            savedLog = await callLogService.logCall({
                callSid: CallSid,
                dialCallSid: DialCallSid || null,
                agentId: resolvedAgentId,
                campaignId: campaign,
                from: From || '',
                to: To || '',
                duration: effectiveDuration,
                status: effectiveStatus,
                recordingUrl: finalRecordingUrl,
                disposition: '',
                qaInsight: null,
                isBillable: effectiveDuration >= (process.env.BILLING_DURATION_THRESHOLD || 60)
            });
        }
    } catch (err) {
        console.error('[Twilio] Failed to persist call log:', err.message);
    } finally {
      if (CallSid) {
        await agentManager.releaseStaleRingingForCall(CallSid, resolvedAgentId || null);
      }
      if (resolvedAgentId) {
        try {
            const activeRow = await agentManager.getActiveCall(resolvedAgentId);
            const isMatch = activeRow && (String(activeRow.callSid) === String(CallSid) || String(activeRow.parentCallSid) === String(CallSid));
            if (activeRow && !isMatch) {
                console.warn(
                  `[Router] Skip stale completion release for ${resolvedAgentId}: callback sid ${CallSid} != active sid ${activeRow.callSid} / ${activeRow.parentCallSid || 'none'}`,
                );
            } else {
                if (effectiveStatus === 'completed') {
                    // Fallback if browser never emitted agent:call_incoming before hangup.
                    if (!activeRow) {
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
function serviceErrorStatus(err) {
    const map = {
        NOT_FOUND: 404,
        ALREADY_REFUNDED: 409,
        NOT_BILLABLE: 400,
        REASON_TOO_SHORT: 400,
        CONTEST_PENDING: 409,
        CONTEST_EXPIRED: 400,
        PROOF_REQUIRED: 400,
        FILE_TOO_LARGE: 413,
        INVALID_CATEGORY: 400,
        UNAVAILABLE: 503,
        STORAGE_UNAVAILABLE: 503,
    };
    return map[err.code] || 500;
}

exports.submitCallContest = async (req, res) => {
    try {
        const { callLogId } = req.params;
        const { reason, category } = req.body || {};
        const files = Array.isArray(req.files) ? req.files : [];
        const result = await callContestService.submitContest(req.user.uid, callLogId, {
            reason,
            category,
            files,
        });
        res.status(201).json(result);
    } catch (err) {
        console.error('[Voice] submitCallContest:', err.message);
        res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to submit contest' });
    }
};

exports.serveContestProof = async (req, res) => {
    try {
        const contestId = String(req.query.contestId || '').trim();
        const proofId = String(req.query.proofId || '').trim();
        if (!contestId || !proofId) {
            return res.status(400).json({ error: 'contestId and proofId are required' });
        }

        const ownerId = await contestProofStorage.getContestAgentId(contestId);
        if (!ownerId) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const userDoc = await getUserDoc(req.user.uid);
        const isAdmin = userDoc?.role === 'admin';
        if (req.user.uid !== ownerId && !isAdmin) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { buffer, mimeType } = await contestProofStorage.readProof(contestId, proofId);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(buffer);
    } catch (err) {
        const status = err.code === 'NOT_FOUND' ? 404 : 500;
        if (!res.headersSent) {
            res.status(status).json({ error: err.message || 'Failed to load proof file' });
        }
    }
};

exports.getCallContestStatus = async (req, res) => {
    try {
        const { callLogId } = req.params;
        const contest = await callContestService.getContestForAgent(req.user.uid, callLogId);
        res.json({ contest });
    } catch (err) {
        console.error('[Voice] getCallContestStatus:', err.message);
        res.status(500).json({ error: 'Failed to load contest status' });
    }
};

exports.updateCallLog = async (req, res) => {
    try {
        const { callSid } = req.params;
        const { disposition } = req.body;
        const uid = req.user.uid;

        if (!callSid || !disposition) {
            return res.status(400).json({ error: 'callSid and disposition are required' });
        }

        // 1. Update Firestore
        let targetSids = [callSid];
        const activeCall = await agentManager.getActiveCall(uid);
        if (activeCall) {
            if (activeCall.parentCallSid) targetSids.push(activeCall.parentCallSid);
            if (activeCall.callSid) targetSids.push(activeCall.callSid);
        }
        
        const success = await callLogService.updateCallLogBySid(uid, targetSids, { disposition });
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

/**
 * Initiate an ACA transfer — dials the broker into the ongoing conference.
 */
exports.initiateAcaTransfer = async (req, res) => {
    try {
        const agentId = req.user.uid;
        
        // Find the conference associated with this agent
        const confName = await redisClient.get(`aca:conf:${agentId}`);
        if (!confName) {
            return res.status(404).json({ error: 'Active ACA conference not found for agent' });
        }
        
        const fromNum = process.env.TWILIO_ACA_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+10000000000';
        const brokerNumber = '+18557886275';
        
        console.log(`[ACA Transfer] Initiating transfer for agent ${agentId} in conf ${confName} to ${brokerNumber}`);
        
        // Add broker to the existing conference
        const participant = await twilioClientObj.conferences(confName).participants.create({
            to: brokerNumber,
            from: fromNum,
            earlyMedia: true,
            beep: false,
            label: 'marketplace_broker',
        });
        
        res.json({ success: true, brokerCallSid: participant.callSid, conferenceName: confName });
    } catch (err) {
        console.error('[ACA Transfer] Failed to initiate:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Send DTMF digits to the broker leg using Twilio REST API.
 * DEPRECATED: We now use the frontend Twilio Device to send DTMF directly.
 */
exports.sendDtmfToConference = async (req, res) => {
    try {
        const { brokerCallSid, digit } = req.body;
        if (!brokerCallSid || !digit) {
            return res.status(400).json({ error: 'brokerCallSid and digit are required' });
        }
        
        await twilioClientObj.calls(brokerCallSid).update({
            sendDigits: String(digit)
        });
        
        res.json({ success: true });
    } catch (err) {
        console.error('[ACA Transfer] Failed to send DTMF:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Forcefully kill the customer's call (the parent call).
 * This destroys the conference for all participants.
 */
exports.killCall = async (req, res) => {
    try {
        const agentId = req.user.uid;
        const activeCall = await agentManager.getActiveCall(agentId);
        
        if (activeCall) {
            const sid = activeCall.callSid;
            const parentSid = activeCall.parentCallSid;
            console.log(`[Twilio] Agent ${agentId} triggered forceful kill of call(s). Sid: ${sid}, Parent: ${parentSid || 'none'}`);
            
            // Safely kill both the agent leg and the customer parent leg if they differ
            if (sid) {
                twilioClientObj.calls(sid).update({ status: 'completed' })
                    .catch(err => console.error(`[Twilio] Failed to kill agent call ${sid}:`, err.message));
            }
            if (parentSid && parentSid !== sid) {
                twilioClientObj.calls(parentSid).update({ status: 'completed' })
                    .catch(err => console.error(`[Twilio] Failed to kill parent call ${parentSid}:`, err.message));
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('[Twilio] Failed to kill call:', err);
        res.status(500).json({ error: err.message });
    }
};

