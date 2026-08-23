const { parseRecordingSid } = require('../utils/recordingSid');

async function fetchRecordingMp3Buffer(recordingSid) {
  const sid = parseRecordingSid(recordingSid);
  if (!sid) throw new Error('Recording SID is required');
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error('Twilio credentials missing');

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;
  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

  let response = await fetch(twilioUrl, {
    headers: { Authorization: authHeader },
    redirect: 'manual',
  });

  if (response.status === 302 || response.status === 307) {
    const redirectUrl = response.headers.get('location');
    if (!redirectUrl) throw new Error('Twilio redirect missing location header');
    response = await fetch(redirectUrl);
  }

  if (!response.ok) {
    throw new Error(`Twilio/S3 returned ${response.status} for ${sid}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { fetchRecordingMp3Buffer };
