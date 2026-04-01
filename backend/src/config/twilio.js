const twilio = require('twilio');
require('dotenv').config();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID
} = process.env;

// This client handles placing outbound logic if needed
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// The VoiceGrant enables the React application to receive and make calls
const VoiceGrant = twilio.jwt.AccessToken.VoiceGrant;

module.exports = {
  twilioClient,
  VoiceGrant,
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID
};
