const express = require('express');
const crypto = require('crypto');
const admin = require('../config/firebaseAdmin');
const { verifyFirebaseToken } = require('../middleware/auth');

const router = express.Router();

const VERIFIED_STATUSES = new Set(['approved', 'completed']);
const FAILED_STATUSES = new Set(['failed', 'declined', 'expired']);

function parseJsonBody(req) {
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    return { payload: JSON.parse(raw), rawBody: raw };
  }
  if (typeof req.body === 'string') {
    return { payload: JSON.parse(req.body), rawBody: req.body };
  }
  return { payload: req.body, rawBody: req.rawBody || JSON.stringify(req.body || {}) };
}

function attr(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function extractInquiry(payload) {
  const eventType = payload?.data?.attributes?.name || payload?.data?.type || '';
  const inquiry =
    payload?.data?.attributes?.payload?.data
    || payload?.data?.attributes?.payload
    || payload?.data;
  const attrs = inquiry?.attributes || {};
  return {
    eventType: String(eventType),
    inquiryId: inquiry?.id || null,
    status: String(attr(attrs, 'status') || '').toLowerCase(),
    referenceId: attr(attrs, 'referenceId', 'reference-id', 'reference_id') || null,
  };
}

async function setPersonaStatus(uid, status, inquiryId) {
  const db = admin.firestore();
  const patch = {
    personaStatus: status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (inquiryId) patch.personaInquiryId = inquiryId;
  await db.collection('users').doc(uid).set(patch, { merge: true });
}

function verifyPersonaSignature(req, rawBody, secret) {
  if (!secret) return true;

  const signatureHeader = req.headers['persona-signature'];
  if (!signatureHeader) return false;

  const parts = String(signatureHeader).split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const sigPart = parts.find((p) => p.startsWith('v1='));
  if (!timestampPart || !sigPart) return false;

  const t = timestampPart.split('=')[1];
  const v1 = sigPart.split('=')[1];
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');

  if (expectedSig !== v1) {
    console.warn('[Persona] Webhook signature mismatch.');
    return false;
  }
  return true;
}

async function fetchPersonaInquiry(inquiryId) {
  const apiKey = String(process.env.PERSONA_API_KEY || '').trim();
  if (!apiKey) return null;

  const res = await fetch(
    `https://api.withpersona.com/api/v1/inquiries/${encodeURIComponent(inquiryId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Key-Inflection': 'camel',
      },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Persona inquiry lookup failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

router.post('/webhook', async (req, res) => {
  try {
    const { payload, rawBody } = parseJsonBody(req);
    const secret = String(process.env.PERSONA_WEBHOOK_SECRET || '').trim();
    if (secret && !verifyPersonaSignature(req, rawBody, secret)) {
      return res.status(401).send('Invalid signature');
    }

    const { eventType, inquiryId, status, referenceId } = extractInquiry(payload);
    console.log(`[Persona Webhook] event=${eventType} status=${status} ref=${referenceId || 'none'} inquiry=${inquiryId || 'none'}`);

    if (!referenceId) {
      return res.status(200).send('OK');
    }

    const approvedEvent = eventType === 'inquiry.approved' || eventType === 'inquiry.completed';
    const failedEvent = eventType === 'inquiry.failed'
      || eventType === 'inquiry.declined'
      || eventType === 'inquiry.expired'
      || eventType === 'inquiry.redacted';

    if (approvedEvent && (VERIFIED_STATUSES.has(status) || eventType === 'inquiry.approved')) {
      await setPersonaStatus(referenceId, 'verified', inquiryId);
      console.log(`[Persona Webhook] Verified user ${referenceId}`);
    } else if (failedEvent || FAILED_STATUSES.has(status)) {
      const next = eventType === 'inquiry.redacted' ? 'unverified' : 'failed';
      await setPersonaStatus(referenceId, next, inquiryId);
      console.log(`[Persona Webhook] Set user ${referenceId} to ${next}`);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[Persona Webhook] Error:', err);
    res.status(500).send('Webhook Error');
  }
});

/**
 * Client finished the Persona modal. Confirm against Persona's API (not the
 * browser) then persist personaStatus. Production PATCH /api/users/me strips
 * personaStatus, so this is the only authenticated write path besides webhooks.
 */
router.post('/confirm', verifyFirebaseToken, async (req, res) => {
  try {
    const inquiryId = String(req.body?.inquiryId || '').trim();
    if (!inquiryId) {
      return res.status(400).json({ error: 'inquiryId is required' });
    }
    if (!String(process.env.PERSONA_API_KEY || '').trim()) {
      return res.status(503).json({
        error: 'Persona API key is not configured on the server',
        code: 'PERSONA_API_KEY_MISSING',
      });
    }

    const inquiryPayload = await fetchPersonaInquiry(inquiryId);
    const { status, referenceId } = extractInquiry(inquiryPayload);
    const uid = req.user.uid;

    if (referenceId && referenceId !== uid) {
      return res.status(403).json({ error: 'Inquiry does not belong to this user' });
    }

    if (!VERIFIED_STATUSES.has(status)) {
      return res.status(409).json({
        error: `Inquiry is not approved yet (status: ${status || 'unknown'})`,
        status,
        personaStatus: status === 'declined' || status === 'failed' ? 'failed' : 'unverified',
      });
    }

    await setPersonaStatus(uid, 'verified', inquiryId);
    return res.json({ ok: true, personaStatus: 'verified', inquiryId, status });
  } catch (err) {
    console.error('[Persona Confirm] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to confirm Persona inquiry' });
  }
});

module.exports = router;
