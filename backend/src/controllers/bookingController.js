const crypto = require('crypto');
const { upsertCalendlyBooking, listBookings } = require('../services/bookingService');

function parseSignatureHeader(header) {
  if (!header) return null;
  const parts = header.split(',');
  const out = {};
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k && v) out[k.trim()] = v.trim();
  }
  return out;
}

function verifyCalendlySignature(req, rawBody) {
  const secret = process.env.CALENDLY_SIGNING_KEY;
  if (!secret) return true; // best-effort if not configured

  const header = req.headers['calendly-webhook-signature'];
  const parsed = parseSignatureHeader(header);
  if (!parsed || !parsed.t || !parsed.v1) return false;

  const payloadToSign = `${parsed.t}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payloadToSign).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(parsed.v1), Buffer.from(digest));
}

async function handleCalendlyWebhook(req, res) {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    if (!verifyCalendlySignature(req, rawBody)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = req.body || {};
    const event = payload.payload || payload; // support direct event or wrapped payload

    await upsertCalendlyBooking({
      uri: event.event?.uri || event.uri,
      uuid: event.event?.uuid || event.uuid,
      id: event.id,
      status: event.status,
      start_time: event.event?.start_time || event.start_time,
      end_time: event.event?.end_time || event.end_time,
      invitee: event.invitee || {
        name: event.name,
        email: event.email,
      },
    });

    res.json({ received: true });
  } catch (err) {
    console.error('[Bookings] Calendly webhook error:', err.message);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}

async function getBookings(req, res) {
  try {
    const items = await listBookings(100);
    res.json({ bookings: items });
  } catch (err) {
    console.error('[Bookings] list error:', err.message);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
}

module.exports = {
  handleCalendlyWebhook,
  getBookings,
};

