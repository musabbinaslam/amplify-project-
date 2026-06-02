const crypto = require('crypto');

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const META_EVENT_SOURCE_URL_FALLBACK = process.env.CLIENT_URL || 'https://www.callsflow.io/signup';

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

function sha256(str) {
  return crypto.createHash('sha256').update(normalize(str)).digest('hex');
}

function normalizePhoneE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (String(raw || '').trim().startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

function splitName(fullName) {
  const value = String(fullName || '').trim();
  if (!value) return { firstName: '', lastName: '' };
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function getDatasetId() {
  return String(process.env.META_DATASET_ID || process.env.META_PIXEL_ID || '').trim();
}

function getAccessToken() {
  return String(process.env.META_ACCESS_TOKEN || '').trim();
}

function isConfigured() {
  return Boolean(getDatasetId() && getAccessToken());
}

async function sendCompleteRegistration({
  eventId,
  email,
  phone,
  fullName,
  clientUserAgent,
  clientIpAddress,
  eventSourceUrl,
}) {
  if (!isConfigured()) {
    return { skipped: true, reason: 'META_DATASET_ID/META_ACCESS_TOKEN missing' };
  }

  const datasetId = getDatasetId();
  const accessToken = getAccessToken();
  const { firstName, lastName } = splitName(fullName);
  const phoneE164 = normalizePhoneE164(phone);

  const userData = {
    ...(email ? { em: [sha256(email)] } : {}),
    ...(phoneE164 ? { ph: [sha256(phoneE164)] } : {}),
    ...(firstName ? { fn: [sha256(firstName)] } : {}),
    ...(lastName ? { ln: [sha256(lastName)] } : {}),
    ...(clientUserAgent ? { client_user_agent: String(clientUserAgent) } : {}),
    ...(clientIpAddress ? { client_ip_address: String(clientIpAddress) } : {}),
  };

  const body = {
    data: [
      {
        event_name: 'CompleteRegistration',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: String(eventSourceUrl || META_EVENT_SOURCE_URL_FALLBACK),
        ...(eventId ? { event_id: String(eventId) } : {}),
        user_data: userData,
      },
    ],
  };

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || `Meta CAPI failed (${response.status})`;
    throw new Error(message);
  }

  return { ok: true, payload };
}

module.exports = {
  isConfigured,
  sendCompleteRegistration,
};
