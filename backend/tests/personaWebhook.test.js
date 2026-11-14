const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const routerPath = path.resolve(__dirname, '../src/routes/personaRoutes.js');
const userDataServicePath = path.resolve(__dirname, '../src/services/userDataService.js');

const SECRET = 'test_persona_webhook_secret';
const PAYLOAD = {
  data: {
    type: 'inquiry',
    id: 'inq_abc',
    attributes: { name: 'inquiry.approved', status: 'approved', referenceId: 'uid_1' },
  },
};

function loadWebhook() {
  const mergeCalls = [];
  delete require.cache[routerPath];
  delete require.cache[userDataServicePath];
  require.cache[userDataServicePath] = {
    exports: { mergeUserDoc: async (uid, body) => { mergeCalls.push({ uid, body }); } },
  };
  const router = require(routerPath);
  const layer = router.stack.find((l) => l.route?.path === '/webhook');
  return {
    handle: layer.route.stack[0].handle,
    mergeCalls,
    restore() {
      delete require.cache[routerPath];
      delete require.cache[userDataServicePath];
    },
  };
}

async function postWebhook({ secret, signature }) {
  const prev = process.env.PERSONA_WEBHOOK_SECRET;
  if (secret === undefined) delete process.env.PERSONA_WEBHOOK_SECRET;
  else process.env.PERSONA_WEBHOOK_SECRET = secret;

  const rawBody = JSON.stringify(PAYLOAD);
  const { handle, mergeCalls, restore } = loadWebhook();
  const req = { headers: {}, body: Buffer.from(rawBody) };
  if (signature !== undefined) req.headers['persona-signature'] = signature;
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, send(payload) { this.body = payload; return this; } };
  try {
    await handle(req, res);
    return { res, mergeCalls };
  } finally {
    restore();
    if (prev === undefined) delete process.env.PERSONA_WEBHOOK_SECRET;
    else process.env.PERSONA_WEBHOOK_SECRET = prev;
  }
}

function sign(t = '1700000000') {
  const v1 = crypto.createHmac('sha256', SECRET).update(`${t}.${JSON.stringify(PAYLOAD)}`).digest('hex');
  return { v1, header: `t=${t},v1=${v1}` };
}

test('missing secret rejects webhook with 503', async () => {
  const { res, mergeCalls } = await postWebhook({ secret: '  ' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body, 'Persona webhook secret not configured');
  assert.equal(mergeCalls.length, 0);
});

test('missing or invalid signature rejects webhook with 401', async () => {
  const missing = await postWebhook({ secret: SECRET });
  assert.equal(missing.res.statusCode, 401);
  assert.equal(missing.res.body, 'Invalid signature');
  assert.equal(missing.mergeCalls.length, 0);

  const invalid = await postWebhook({ secret: SECRET, signature: 't=1,v1=deadbeef' });
  assert.equal(invalid.res.statusCode, 401);
  assert.equal(invalid.res.body, 'Invalid signature');
  assert.equal(invalid.mergeCalls.length, 0);
});

test('valid signature (including rotated v1) verifies user', async () => {
  const { header, v1 } = sign();
  const valid = await postWebhook({ secret: SECRET, signature: header });
  assert.equal(valid.res.statusCode, 200);
  assert.equal(valid.res.body, 'OK');
  assert.deepEqual(valid.mergeCalls, [{
    uid: 'uid_1',
    body: { personaStatus: 'verified', personaInquiryId: 'inq_abc' },
  }]);

  const rotated = await postWebhook({ secret: SECRET, signature: `t=1700000000,v1=ab,v1=${v1}` });
  assert.equal(rotated.res.statusCode, 200);
  assert.equal(rotated.mergeCalls.length, 1);
});
