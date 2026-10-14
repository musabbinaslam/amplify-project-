const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const firebaseAdminPath = path.resolve(__dirname, '../src/config/firebaseAdmin.js');
const firestoreDbPath = path.resolve(__dirname, '../src/config/firestoreDb.js');
const callLogServicePath = path.resolve(__dirname, '../src/services/callLogService.js');
const callTracePath = path.resolve(__dirname, '../src/services/callTraceService.js');
const walletServicePath = path.resolve(__dirname, '../src/services/walletService.js');
const readCachePath = path.resolve(__dirname, '../src/utils/readCache.js');

const SENTINEL_TS = { _sentinel: 'serverTimestamp' };
const SENTINEL_DELETE = { _sentinel: 'delete' };

function createMemoryDb() {
  const store = new Map();
  let autoId = 0;

  function isDirectChild(path, prefix) {
    if (!path.startsWith(`${prefix}/`)) return false;
    return !path.slice(prefix.length + 1).includes('/');
  }

  function applyMerge(existing, incoming) {
    const next = { ...(existing || {}) };
    for (const [key, value] of Object.entries(incoming)) {
      if (value && value._sentinel === 'delete') delete next[key];
      else next[key] = value;
    }
    return next;
  }

  function makeCollection(parts) {
    const prefix = parts.join('/');
    return {
      doc(id) {
        return makeDoc([...parts, id]);
      },
      async add(data) {
        autoId += 1;
        const id = `doc_${autoId}`;
        store.set(`${prefix}/${id}`, { ...data });
        return { id };
      },
      where(field, op, value) {
        return {
          limit() {
            return {
              async get() {
                const docs = [];
                for (const [docPath, data] of store) {
                  if (!isDirectChild(docPath, prefix)) continue;
                  if (op === '==' && data[field] === value) {
                    const id = docPath.slice(prefix.length + 1);
                    docs.push({ id, data: () => ({ ...data }) });
                  }
                }
                return { empty: docs.length === 0, docs };
              },
            };
          },
        };
      },
    };
  }

  function makeDoc(parts) {
    const docPath = parts.join('/');
    const id = parts[parts.length - 1];
    return {
      id,
      collection(name) {
        return makeCollection([...parts, name]);
      },
      async get() {
        const data = store.get(docPath);
        return {
          exists: data !== undefined,
          id,
          data: () => (data ? { ...data } : undefined),
        };
      },
      async set(data, opts = {}) {
        if (opts.merge && store.has(docPath)) {
          store.set(docPath, applyMerge(store.get(docPath), data));
        } else {
          store.set(docPath, { ...data });
        }
      },
      async update(data) {
        if (!store.has(docPath)) throw new Error(`Missing doc ${docPath}`);
        store.set(docPath, { ...store.get(docPath), ...data });
      },
    };
  }

  return {
    collection(name) {
      return makeCollection([name]);
    },
    _store: store,
    listCallLogs(uid) {
      const prefix = `users/${uid}/callLogs`;
      const rows = [];
      for (const [docPath, data] of store) {
        if (!isDirectChild(docPath, prefix)) continue;
        rows.push({ id: docPath.slice(prefix.length + 1), ...data });
      }
      return rows;
    },
  };
}

function loadCallLogService(db) {
  const mockAdmin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => SENTINEL_TS,
        delete: () => SENTINEL_DELETE,
        increment: (n) => ({ _sentinel: 'increment', n }),
      },
    },
  };

  delete require.cache[firebaseAdminPath];
  delete require.cache[firestoreDbPath];
  delete require.cache[callLogServicePath];
  delete require.cache[callTracePath];
  delete require.cache[walletServicePath];
  delete require.cache[readCachePath];

  require.cache[firebaseAdminPath] = { exports: mockAdmin };
  require.cache[firestoreDbPath] = { exports: { getDb: () => db } };
  require.cache[callTracePath] = { exports: { trace() {}, clearLiveSoon() {} } };
  require.cache[walletServicePath] = { exports: { deductCredits: async () => 9999 } };
  require.cache[readCachePath] = { exports: { invalidateNamespaceSoon() {} } };

  return require(callLogServicePath);
}

test('early disposition PATCH creates a stub that logCall merges without touching the previous call', async () => {
  const db = createMemoryDb();
  const callLogService = loadCallLogService(db);

  const uid = 'agent_wrapup_1';
  const previousSid = 'CA_PREVIOUS_CALL';
  const parentSid = 'CA_PARENT_CURRENT';
  const dialSid = 'CA_DIAL_CURRENT';

  const previousRef = await db.collection('users').doc(uid).collection('callLogs').add({
    callSid: previousSid,
    dialCallSid: 'CA_DIAL_PREVIOUS',
    disposition: 'callback',
    status: 'completed',
    duration: 42,
    createdAt: '2026-10-14T20:00:00.000Z',
  });

  const updated = await callLogService.updateCallLogBySid(
    uid,
    [parentSid, dialSid],
    { disposition: 'policy_closed' },
  );
  assert.equal(updated, true);

  const afterPatch = db.listCallLogs(uid);
  assert.equal(afterPatch.length, 2);

  const previousAfterPatch = afterPatch.find((row) => row.id === previousRef.id);
  assert.ok(previousAfterPatch);
  assert.equal(previousAfterPatch.callSid, previousSid);
  assert.equal(previousAfterPatch.disposition, 'callback');
  assert.equal(previousAfterPatch.duration, 42);

  const stub = afterPatch.find((row) => row.callSid === parentSid);
  assert.ok(stub, 'early PATCH should create a stub keyed by parent CallSid');
  assert.equal(stub.dialCallSid, dialSid);
  assert.equal(stub.disposition, 'policy_closed');
  assert.equal(stub.pendingStub, true);
  assert.equal(stub.createdAt, SENTINEL_TS);
  assert.equal(stub.updatedAt, SENTINEL_TS);

  const merged = await callLogService.logCall({
    callSid: parentSid,
    dialCallSid: dialSid,
    agentId: uid,
    campaignId: 'fe_inbounds_short',
    from: '+15551112222',
    to: '+15553334444',
    duration: 95,
    status: 'completed',
    recordingUrl: null,
    recordingSid: null,
  });

  assert.equal(merged.id, stub.id);

  const afterLog = db.listCallLogs(uid);
  assert.equal(afterLog.length, 2, 'logCall must merge into the stub, not add a second current-call doc');

  const previousAfterLog = afterLog.find((row) => row.id === previousRef.id);
  assert.equal(previousAfterLog.disposition, 'callback');
  assert.equal(previousAfterLog.callSid, previousSid);

  const current = afterLog.find((row) => row.id === stub.id);
  assert.equal(current.callSid, parentSid);
  assert.equal(current.dialCallSid, dialSid);
  assert.equal(current.disposition, 'policy_closed');
  assert.equal(current.status, 'completed');
  assert.equal(current.duration, 95);
  assert.equal(current.pendingStub, undefined);
});

test('updateCallLogBySid without disposition does not create a stub', async () => {
  const db = createMemoryDb();
  const callLogService = loadCallLogService(db);
  const uid = 'agent_backfill_1';

  const ok = await callLogService.updateCallLogBySid(
    uid,
    ['CA_PARENT_BACKFILL'],
    { recordingUrl: 'https://api.twilio.com/rec.mp3', recordingSid: 'RE123' },
  );
  assert.equal(ok, true);
  assert.equal(db.listCallLogs(uid).length, 0);
});
