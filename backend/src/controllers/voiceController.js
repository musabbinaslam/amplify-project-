const twilio = require('twilio');
const { VoiceGrant, TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = require('../config/twilio');
const { VoiceResponse } = twilio.twiml;
const agentManager = require('../services/agentManager');

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
  const callerState = req.body.FromState || 'Unknown';
  
  // Here we would use Trackdrive parameters passed via URL mapping, e.g., ?campaign=final_expense
  const campaign = req.query.campaign; 

  console.log(`[Twilio Webhook] Incoming call routed for Campaign: ${campaign}, State: ${callerState}`);

  try {
     const assignedAgent = await agentManager.findAndLockAvailableAgent(campaign);

     if (assignedAgent) {
        twiml.say('Connecting you to an agent.');
        twiml.dial().client(assignedAgent.id);
     } else {
        twiml.say('All agents are currently assisting other callers. Please hold or try again later.');
     }
  } catch(error) {
     console.error('Routing Error:', error);
     twiml.say('An application error occurred while routing your call.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
};
