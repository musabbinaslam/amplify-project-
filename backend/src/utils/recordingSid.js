function parseRecordingSid(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/(RE[0-9a-fA-F]{32})/);
  return match ? match[1] : null;
}

function recordingMp3Url(recordingSid) {
  const sid = parseRecordingSid(recordingSid);
  if (!sid || !process.env.TWILIO_ACCOUNT_SID) return null;
  return `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${sid}.mp3`;
}

function isMockCallLog(data = {}) {
  const callSid = String(data.callSid || data.id || '');
  const recordingUrl = String(data.recordingUrl || '');
  if (/opsmock|ops_mock|ca_ops_mock|ca_mock/i.test(callSid)) return true;
  if (/\/Accounts\/mock\//i.test(recordingUrl)) return true;
  if (/mock/i.test(recordingUrl) && /Recordings/i.test(recordingUrl)) return true;
  if (data.isMock === true || data.mock === true || data.seeded === true) return true;
  return false;
}

module.exports = { parseRecordingSid, recordingMp3Url, isMockCallLog };
