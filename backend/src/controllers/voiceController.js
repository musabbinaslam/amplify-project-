const twilio = require('twilio');
const { VoiceGrant, TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = require('../config/twilio');
const { VoiceResponse } = twilio.twiml;
const agentManager = require('../services/agentManager');
const callLogService = require('../services/callLogService');
const phoneRouteService = require('../services/phoneRouteService');
const { redisClient } = require('../config/redis');
const { qaInsightQueue } = require('../queues/qaQueue');

exports.generateToken = (req, res) => {
  const { identity } = req.body;
  
  if (!identity) {
    return res.status(400).json({ error: 'identity is required' });
  }

  // Create an access token
  const token = new twilio.jwt.AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    { identity }
  );

  // Grant access to Voice using our TwiML App
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    incomingAllow: true // Critical: Allows React to RECEIVE calls
  });

  token.addGrant(voiceGrant);

  // Serialize the token to a JWT string
  res.json({ token: token.toJwt(), identity });
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

    const savedLog = await callLogService.logCall({
        from: From,
        to: To,
        duration: DialCallDuration,
        campaignId: campaign,
        agentId: agentId,
        status: DialCallStatus === 'completed' ? 'completed' : 'missed',
        callSid: CallSid,
        recordingUrl: RecordingUrl || null
    });

    // Non-blocking QA insight generation dispatched cleanly via BullMQ
    if (agentId && savedLog?.id) {
        try {
            await qaInsightQueue.add('generate-qa-insight', {
                savedLog,
                agentId,
                FromState: FromState || null
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: false
            });
            console.log(`[Twilio] Queued QA Insight generation for Call ${savedLog.id}`);
        } catch (err) {
            console.error('[QA] Failed to dispatch QA job to queue:', err.message);
        }
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
        const limit = Math.min(Number(req.query.limit || 100), 500);
        const logs = await callLogService.getLogsByUser(req.user.uid, limit);
        res.json(logs);
    } catch (err) {
        console.error('[Voice] getLogs error:', err.message);
        res.status(500).json({ error: 'Failed to load call logs' });
    }
};
/**
 * Proxy a Twilio recording so the browser doesn't need to authenticate directly.
 */
exports.proxyRecording = async (req, res) => {
    const { recordingSid } = req.params;
    const { twilioClient, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = require('../config/twilio');

    if (!recordingSid) {
        return res.status(400).json({ error: 'Recording SID is required' });
    }

    try {
        console.log(`[Proxy] Streaming recording: ${recordingSid}`);
        
        // Construct the Twilio recording URL
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${recordingSid}.mp3`;

        const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

        const response = await fetch(twilioUrl, {
            headers: {
                'Authorization': authHeader
            }
        });

        if (!response.ok) {
            throw new Error(`Twilio returned ${response.status}`);
        }

        // Set the correct content type
        res.set('Content-Type', 'audio/mpeg');
        
        // Pipe the stream to the response
        const { Readable } = require('stream');
        Readable.fromWeb(response.body).pipe(res);
    } catch (err) {
        console.error(`[Proxy] Failed to stream recording ${recordingSid}:`, err.message);
        res.status(500).json({ error: 'Failed to load recording' });
    }
};
