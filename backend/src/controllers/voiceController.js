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
        await agentManager.upsertActiveCall(available.id, {
          callSid: req.body?.CallSid || req.body?.CallSidInbound || '',
          from: fromNumber,
          to: toNumber,
          campaignId: campaign,
          startedAt: new Date().toISOString(),
          state: 'bridging',
        });
        const dial = twiml.dial({
          action: `/api/voice/call-completed?campaign=${campaign}&agentId=${available.id}`,
          method: 'POST',
          timeout: 20,
          answerOnBridge: true,
          record: 'record-from-answer'
        });
        
        const clientNode = dial.client(available.id);
        // Trackdrive Lead Data has been deliberately removed — dialing purely via Twilio
     } else {
        twiml.say('All agents are currently assisting other callers.');
     }
  } catch(error) {
     console.error('Routing Error:', error);
     twiml.say('An error occurred in the routing logic.');
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
};

/**
 * Handle call completion metadata from Twilio
 */
exports.handleCallCompleted = async (req, res) => {
    const { campaign, agentId } = req.query;
    const { From, To, DialCallDuration, DialCallStatus, CallSid, FromState, RecordingUrl } = req.body;

    console.log(`[Twilio] Call Completed: ${CallSid}. Duration: ${DialCallDuration}s. Status: ${DialCallStatus}. Recording: ${RecordingUrl ? 'Yes' : 'No'}`);

    let savedLog = null;
    let resolvedAgentId = agentId || null;
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
            recordingUrl: RecordingUrl || null
        });
    } catch (err) {
        console.error('[Twilio] Failed to persist call log:', err.message);
    } finally {
      if (resolvedAgentId) {
        try {
            await agentManager.clearActiveCall(resolvedAgentId);
            await agentManager.releaseAgent(resolvedAgentId);
        } catch (e) {
            console.warn('[Router] release after completion failed:', e.message);
        }
      }
    }

    // Non-blocking QA insight generation — runs in-process with exponential backoff retries.
    // Dispatched AFTER the HTTP response is already sent, so call handling is never delayed.
    if (resolvedAgentId && savedLog?.id) {
        dispatchQaInsightJob({
            savedLog,
            agentId: resolvedAgentId,
            FromState: FromState || null,
        });
        console.log(`[Twilio] QA Insight dispatched (async) for Call ${savedLog.id}`);
    }

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
