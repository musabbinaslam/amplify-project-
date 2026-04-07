const twilio = require('twilio');
const { VoiceGrant, TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = require('../config/twilio');
const { VoiceResponse } = twilio.twiml;
const agentManager = require('../services/agentManager');
const callLogService = require('../services/callLogService');
const phoneRouteService = require('../services/phoneRouteService');
const { redisClient } = require('../config/redis');

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
  const callerState = (req.body && req.body.FromState) || null; // e.g. "TX"
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

  console.log(`[Twilio Webhook] 🔔 Incoming call from: ${fromNumber} | State: ${callerState || 'Unknown'}`);
  console.log(`[Twilio Webhook] 🎯 Target Campaign: ${campaign}`);

  try {
     const available = await agentManager.findAndLockAvailableAgent(campaign, callerState);
     
     // Fetch Cached Lead Data from Trackdrive webhook
     let leadData = {};
     let normalizedCallerId = fromNumber;
     if (normalizedCallerId && normalizedCallerId !== 'Unknown Caller') {
         normalizedCallerId = normalizedCallerId.replace(/\D/g, '');
         if (normalizedCallerId.length === 10) normalizedCallerId = '1' + normalizedCallerId;
         if (!normalizedCallerId.startsWith('+')) normalizedCallerId = '+' + normalizedCallerId;
         
         const cachedData = await redisClient.get(`lead:trackdrive:${normalizedCallerId}`);
         if (cachedData) {
             try { leadData = JSON.parse(cachedData); } catch(e){}
             console.log(`[Router] 🎯 Matched lead data for ${normalizedCallerId}:`, leadData);
         }
     }

     if (available) {
        twiml.say('Connecting you to an agent.');
        const dial = twiml.dial({
          action: `/api/voice/call-completed?campaign=${campaign}&agentId=${available.id}`,
          method: 'POST',
          timeout: 20,
          answerOnBridge: true
        });
        
        const clientNode = dial.client(available.id);
        
        // Pass Lead Data to React Frontend via Twilio Custom Parameters
        if (Object.keys(leadData).length > 0) {
            for (const [key, value] of Object.entries(leadData)) {
                if (typeof value === 'string' || typeof value === 'number') {
                    // prefix to prevent clashing with twilio defaults
                    clientNode.parameter({ name: `lead_${key}`, value: String(value) });
                }
            }
        }
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
    const { From, To, DialCallDuration, DialCallStatus, CallSid } = req.body;

    console.log(`[Twilio] Call Completed: ${CallSid}. Duration: ${DialCallDuration}s. Status: ${DialCallStatus}`);

    await callLogService.logCall({
        from: From,
        to: To,
        duration: DialCallDuration,
        campaignId: campaign,
        agentId: agentId,
        status: DialCallStatus === 'completed' ? 'completed' : 'missed',
        callSid: CallSid
    });

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
