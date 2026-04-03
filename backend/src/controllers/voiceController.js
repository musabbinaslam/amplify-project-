const twilio = require('twilio');
const { VoiceGrant, TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = require('../config/twilio');
const { VoiceResponse } = twilio.twiml;
const agentManager = require('../services/agentManager');
const callLogService = require('../services/callLogService');

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
  const campaign = queryCampaign || bodyCampaign || 'fe_transfers';

  console.log(`[Twilio Webhook] 🔔 Incoming call from: ${fromNumber} | State: ${callerState || 'Unknown'}`);
  console.log(`[Twilio Webhook] 🎯 Target Campaign: ${campaign}`);

  try {
     const available = await agentManager.findAndLockAvailableAgent(campaign, callerState);
     
     if (available) {
        twiml.say('Connecting you to an agent.');
        twiml.dial({
          action: `/api/voice/call-completed?campaign=${campaign}&agentId=${available.id}`,
          method: 'POST',
          timeout: 20
        }).client(available.id);
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
 * Get call history logs
 */
exports.getLogs = async (req, res) => {
    res.json(callLogService.getLogs());
};
