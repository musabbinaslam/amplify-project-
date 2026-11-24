const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../src/services/userDataService.js');
const firestoreDbPath = path.resolve(__dirname, '../src/config/firestoreDb.js');
const firebaseAdminPath = path.resolve(__dirname, '../src/config/firebaseAdmin.js');

/**
 * In-memory users-collection stub for cache-freshness only.
 * This is not a Firestore merge emulator: set() overlays top-level payload
 * keys so a later get() can observe that a successful write occurred.
 * Nested map merge / sibling-field behavior is intentionally not simulated.
 *
 * get() returns a detached snapshot (structuredClone at read time) so the
 * 20s getUserDoc cache cannot mutate by sharing a reference with the store.
 */
function loadService({ docs = {}, throwOnSet = new Set() } = {}) {
  const store = new Map(
    Object.entries(docs).map(([uid, data]) => [String(uid), structuredClone(data)]),
  );
  const getCounts = {};
  const setCalls = [];

  const mockDb = {
    collection: (colName) => ({
      doc: (uid) => {
        const key = String(uid);
        return {
          get: async () => {
            getCounts[key] = (getCounts[key] || 0) + 1;
            const raw = store.get(key);
            const detached = raw == null ? null : structuredClone(raw);
            return {
              exists: detached != null,
              data: () => detached,
            };
          },
          set: async (payload, opts) => {
            setCalls.push({ uid: key, collection: colName, payload, opts });
            if (throwOnSet.has(key)) {
              throw new Error('write failed');
            }
            const existing = store.get(key) || {};
            store.set(key, { ...existing, ...payload });
          },
        };
      },
    }),
  };

  const mockFirebaseAdmin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
      },
    },
  };

  delete require.cache[servicePath];
  delete require.cache[firestoreDbPath];
  delete require.cache[firebaseAdminPath];
  require.cache[firestoreDbPath] = { exports: { getDb: () => mockDb } };
  require.cache[firebaseAdminPath] = { exports: mockFirebaseAdmin };

  const service = require(servicePath);

  return {
    service,
    store,
    getCounts,
    setCalls,
    restore() {
      delete require.cache[servicePath];
      delete require.cache[firestoreDbPath];
      delete require.cache[firebaseAdminPath];
    },
  };
}

test('mergeSettings invalidates primed cache so the next getUserDoc is fresh', async () => {
  const { service, getCounts, restore } = loadService({
    docs: {
      uid_settings: { settings: { theme: 'dark', notify: true }, role: 'agent' },
    },
  });

  try {
    const primed = await service.getUserDoc('uid_settings');
    assert.equal(primed.settings.theme, 'dark');
    assert.equal(getCounts.uid_settings, 1);

    await service.mergeSettings('uid_settings', { theme: 'light' });
    const after = await service.getUserDoc('uid_settings');

    assert.equal(after.settings.theme, 'light');
    assert.equal(after.settings.notify, true);
    assert.equal(getCounts.uid_settings, 3);
    assert.notEqual(after, primed);
  } finally {
    restore();
  }
});

test('mergeScriptValues invalidates primed cache so the next getUserDoc is fresh', async () => {
  const { service, getCounts, restore } = loadService({
    docs: {
      uid_script: { scriptValues: { 'fe-en': { intro: 'old' } }, role: 'agent' },
    },
  });

  try {
    const primed = await service.getUserDoc('uid_script');
    assert.equal(primed.scriptValues['fe-en'].intro, 'old');
    assert.equal(getCounts.uid_script, 1);

    await service.mergeScriptValues('uid_script', 'fe-en', { intro: 'new' });
    const after = await service.getUserDoc('uid_script');

    assert.equal(after.scriptValues['fe-en'].intro, 'new');
    assert.equal(getCounts.uid_script, 2);
    assert.notEqual(after, primed);
  } finally {
    restore();
  }
});

test('failed mergeSettings write leaves the primed cache in place', async () => {
  const { service, store, getCounts, restore } = loadService({
    docs: {
      uid_settings_fail: { settings: { theme: 'dark' } },
    },
    throwOnSet: new Set(['uid_settings_fail']),
  });

  try {
    const primed = await service.getUserDoc('uid_settings_fail');
    assert.equal(getCounts.uid_settings_fail, 1);

    await assert.rejects(
      () => service.mergeSettings('uid_settings_fail', { theme: 'light' }),
      /write failed/,
    );

    const after = await service.getUserDoc('uid_settings_fail');
    assert.equal(after.settings.theme, 'dark');
    assert.equal(after, primed);
    assert.equal(getCounts.uid_settings_fail, 2);
    assert.equal(store.get('uid_settings_fail').settings.theme, 'dark');
  } finally {
    restore();
  }
});

test('failed mergeScriptValues write leaves the primed cache in place', async () => {
  const { service, store, getCounts, restore } = loadService({
    docs: {
      uid_script_fail: { scriptValues: { 'fe-en': { intro: 'old' } } },
    },
    throwOnSet: new Set(['uid_script_fail']),
  });

  try {
    const primed = await service.getUserDoc('uid_script_fail');
    assert.equal(getCounts.uid_script_fail, 1);

    await assert.rejects(
      () => service.mergeScriptValues('uid_script_fail', 'fe-en', { intro: 'new' }),
      /write failed/,
    );

    const after = await service.getUserDoc('uid_script_fail');
    assert.equal(after.scriptValues['fe-en'].intro, 'old');
    assert.equal(after, primed);
    assert.equal(getCounts.uid_script_fail, 1);
    assert.equal(store.get('uid_script_fail').scriptValues['fe-en'].intro, 'old');
  } finally {
    restore();
  }
});

test('successful mergeSettings invalidation is isolated per uid', async () => {
  const { service, getCounts, restore } = loadService({
    docs: {
      uid_a: { settings: { theme: 'dark' }, role: 'agent' },
      uid_b: { settings: { theme: 'blue' }, role: 'agent' },
    },
  });

  try {
    const primedA = await service.getUserDoc('uid_a');
    const primedB = await service.getUserDoc('uid_b');
    assert.equal(getCounts.uid_a, 1);
    assert.equal(getCounts.uid_b, 1);

    await service.mergeSettings('uid_a', { theme: 'light' });

    const afterB = await service.getUserDoc('uid_b');
    const afterA = await service.getUserDoc('uid_a');

    assert.equal(afterB, primedB);
    assert.equal(afterB.settings.theme, 'blue');
    assert.equal(getCounts.uid_b, 1);

    assert.equal(afterA.settings.theme, 'light');
    assert.notEqual(afterA, primedA);
    assert.equal(getCounts.uid_a, 3);
  } finally {
    restore();
  }
});
