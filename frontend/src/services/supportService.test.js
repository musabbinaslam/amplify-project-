import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.js`, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const firebaseAuth = { currentUser: null };

mock.module(new URL('../config/firebase.js', import.meta.url).href, {
  namedExports: { auth: firebaseAuth },
});

mock.module(new URL('../config/apiBase.js', import.meta.url).href, {
  namedExports: { getApiBaseUrl: () => 'https://api.test' },
});

function jsonRes(status, body, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? 'application/json' : null;
      },
    },
    json: async () => body,
  };
}

function noJsonRes(status, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => null },
    json: async () => {
      throw new Error('no json');
    },
  };
}

function signedIn(initialToken = 'current-token') {
  let cached = initialToken;
  const calls = [];
  firebaseAuth.currentUser = {
    getIdToken: async (force = false) => {
      calls.push(Boolean(force));
      if (force) cached = 'fresh-token';
      return cached;
    },
  };
  return { tokenCalls: calls };
}

let sendSupportEmail;
let fetchMock;

before(async () => {
  ({ sendSupportEmail } = await import('./supportService.js'));
  fetchMock = mock.method(globalThis, 'fetch', async () => jsonRes(200, { ok: true, ticketId: 't1' }));
});

afterEach(() => {
  fetchMock.mock.resetCalls();
  fetchMock.mock.mockImplementation(async () => jsonRes(200, { ok: true, ticketId: 't1' }));
  firebaseAuth.currentUser = null;
});

test('JSON POST uses apiFetch: currentUser bearer, application/json, success shape', async () => {
  signedIn('current-token');
  const payload = { subject: 'Help', category: 'Billing', description: 'Need a receipt' };
  const data = await sendSupportEmail(payload, 'stale-legacy-arg');
  assert.deepEqual(data, { ok: true, ticketId: 't1' });
  assert.equal(fetchMock.mock.calls.length, 1);
  const [url, opts] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://api.test/api/support/email');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers.Authorization, 'Bearer current-token');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.equal(opts.body, JSON.stringify(payload));
});

test('202 warning success shape is returned as-is', async () => {
  signedIn();
  const body = {
    ok: true,
    ticketId: 't2',
    warning: 'Ticket saved, but email delivery failed. Our team has been notified.',
  };
  fetchMock.mock.mockImplementation(async () => jsonRes(202, body));
  assert.deepEqual(await sendSupportEmail({ subject: 'S', category: 'Other', description: 'D' }), body);
});

test('FormData POST omits Content-Type and appends attachments', async () => {
  signedIn('current-token');
  const file = new File([Uint8Array.from([1, 2, 3])], 'shot.png', { type: 'image/png' });
  await sendSupportEmail({
    subject: 'Bug',
    category: 'Technical',
    description: 'See screenshot',
    attachments: [file],
  });
  const [, opts] = fetchMock.mock.calls[0].arguments;
  assert.equal(opts.headers.Authorization, 'Bearer current-token');
  assert.equal(opts.headers['Content-Type'], undefined);
  assert.ok(opts.body instanceof FormData);
  assert.equal(opts.body.get('subject'), 'Bug');
  assert.equal(opts.body.get('category'), 'Technical');
  assert.equal(opts.body.get('description'), 'See screenshot');
  const attached = opts.body.get('attachments');
  assert.ok(attached);
  assert.equal(attached.name, 'shot.png');
});

test('legacy getIdToken string is ignored; 401 retry sends genuinely refreshed bearer', async () => {
  const { tokenCalls } = signedIn('stale-token');
  fetchMock.mock.mockImplementation(async (_url, opts) => {
    if (opts.headers.Authorization === 'Bearer stale-token') {
      return jsonRes(401, { error: 'Invalid or expired token' }, 'Unauthorized');
    }
    return jsonRes(200, { ok: true, ticketId: 't3' });
  });
  const data = await sendSupportEmail(
    { subject: 'S', category: 'Account', description: 'D' },
    'frozen-store-token',
  );
  assert.deepEqual(data, { ok: true, ticketId: 't3' });
  assert.equal(fetchMock.mock.calls.length, 2);
  assert.equal(fetchMock.mock.calls[0].arguments[1].headers.Authorization, 'Bearer stale-token');
  assert.equal(fetchMock.mock.calls[1].arguments[1].headers.Authorization, 'Bearer fresh-token');
  assert.deepEqual(tokenCalls, [false, true, false]);
});

test('401 retry is bound to one attempt', async () => {
  signedIn('stale-token');
  fetchMock.mock.mockImplementation(async () => jsonRes(401, { error: 'Invalid or expired token' }, 'Unauthorized'));
  await assert.rejects(
    () => sendSupportEmail({ subject: 'S', category: 'Other', description: 'D' }),
    (err) => {
      assert.equal(err.message, 'Invalid or expired token');
      assert.equal(err.status, 401);
      return true;
    },
  );
  assert.equal(fetchMock.mock.calls.length, 2);
});

test('force-refresh failure surfaces the original 401 and does not retry fetch', async () => {
  firebaseAuth.currentUser = {
    getIdToken: async (force = false) => {
      if (force) throw new Error('refresh failed');
      return 'stale-token';
    },
  };
  fetchMock.mock.mockImplementation(async () => jsonRes(401, { error: 'Invalid or expired token' }, 'Unauthorized'));
  await assert.rejects(
    () => sendSupportEmail({ subject: 'S', category: 'Other', description: 'D' }),
    (err) => {
      assert.equal(err.message, 'Invalid or expired token');
      assert.equal(err.status, 401);
      return true;
    },
  );
  assert.equal(fetchMock.mock.calls.length, 1);
});

test('backend JSON error text is preserved', async () => {
  signedIn();
  fetchMock.mock.mockImplementation(async () => jsonRes(400, { error: 'Subject is required.' }, 'Bad Request'));
  await assert.rejects(
    () => sendSupportEmail({ subject: '', category: 'Other', description: 'D' }),
    (err) => {
      assert.equal(err.message, 'Subject is required.');
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('statusText without JSON error is passed through (not remapped to old 401 UX copy)', async () => {
  signedIn();
  fetchMock.mock.mockImplementation(async () => jsonRes(401, {}, 'Unauthorized'));
  await assert.rejects(
    () => sendSupportEmail({ subject: 'S', category: 'Other', description: 'D' }),
    (err) => {
      assert.equal(err.message, 'Unauthorized');
      assert.equal(err.status, 401);
      return true;
    },
  );
});

test('generic Request failed maps to support send fallback', async () => {
  signedIn();
  fetchMock.mock.mockImplementation(async () => noJsonRes(500));
  await assert.rejects(
    () => sendSupportEmail({ subject: 'S', category: 'Other', description: 'D' }),
    (err) => {
      assert.equal(err.message, 'Could not send support email. Please try again.');
      assert.equal(err.status, 500);
      return true;
    },
  );
});

test('no currentUser throws Not signed in without fetch', async () => {
  firebaseAuth.currentUser = null;
  await assert.rejects(
    () => sendSupportEmail({ subject: 'S', category: 'Other', description: 'D' }, 'legacy-token'),
    (err) => err.message === 'Not signed in',
  );
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('network errors pass through with no status', async () => {
  signedIn();
  fetchMock.mock.mockImplementation(async () => {
    throw new Error('Failed to fetch');
  });
  await assert.rejects(
    () => sendSupportEmail({ subject: 'S', category: 'Other', description: 'D' }),
    (err) => {
      assert.equal(err.message, 'Failed to fetch');
      assert.equal(err.status, undefined);
      return true;
    },
  );
});
