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

let revokeAllSessions;
let fetchMock;

before(async () => {
  ({ revokeAllSessions } = await import('./settingsService.js'));
  fetchMock = mock.method(globalThis, 'fetch', async () => jsonRes(200, { success: true }));
});

afterEach(() => {
  fetchMock.mock.resetCalls();
  fetchMock.mock.mockImplementation(async () => jsonRes(200, { success: true }));
  firebaseAuth.currentUser = null;
});

test('revoke POST uses currentUser bearer, ignores store token, returns undefined', async () => {
  signedIn('current-token');
  const result = await revokeAllSessions('stale-store-token');
  assert.equal(result, undefined);
  assert.equal(fetchMock.mock.calls.length, 1);
  const [url, opts] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://api.test/api/auth/revoke');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers.Authorization, 'Bearer current-token');
  assert.equal(opts.headers['Content-Type'], undefined);
  assert.equal(opts.body, undefined);
});

test('401 retry sends genuinely refreshed bearer, not the frozen store token', async () => {
  const { tokenCalls } = signedIn('stale-token');
  fetchMock.mock.mockImplementation(async (_url, opts) => {
    if (opts.headers.Authorization === 'Bearer stale-token') {
      return jsonRes(401, { error: 'Invalid or expired token' }, 'Unauthorized');
    }
    return jsonRes(200, { success: true });
  });
  await revokeAllSessions('frozen-store-token');
  assert.equal(fetchMock.mock.calls.length, 2);
  assert.equal(fetchMock.mock.calls[0].arguments[1].headers.Authorization, 'Bearer stale-token');
  assert.equal(fetchMock.mock.calls[1].arguments[1].headers.Authorization, 'Bearer fresh-token');
  assert.deepEqual(tokenCalls, [false, true, false]);
});

test('401 retry is bound to one attempt', async () => {
  signedIn('stale-token');
  fetchMock.mock.mockImplementation(async () => jsonRes(401, { error: 'Invalid or expired token' }, 'Unauthorized'));
  await assert.rejects(
    () => revokeAllSessions('stale-store-token'),
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
    () => revokeAllSessions('stale-store-token'),
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
  fetchMock.mock.mockImplementation(async () => jsonRes(500, { error: 'Failed to revoke sessions' }, 'Internal Server Error'));
  await assert.rejects(
    () => revokeAllSessions('x'),
    (err) => {
      assert.equal(err.message, 'Failed to revoke sessions');
      assert.equal(err.status, 500);
      return true;
    },
  );
});

test('generic Request failed maps to revoke fallback', async () => {
  signedIn();
  fetchMock.mock.mockImplementation(async () => noJsonRes(503));
  await assert.rejects(
    () => revokeAllSessions('x'),
    (err) => {
      assert.equal(err.message, 'Failed to revoke sessions');
      assert.equal(err.status, 503);
      return true;
    },
  );
});

test('no currentUser throws Not signed in without fetch', async () => {
  await assert.rejects(() => revokeAllSessions('legacy-token'), (err) => err.message === 'Not signed in');
  assert.equal(fetchMock.mock.calls.length, 0);
});
