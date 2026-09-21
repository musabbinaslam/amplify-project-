const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../src/services/supportConversationService.js');
const firestoreDbPath = path.resolve(__dirname, '../src/config/firestoreDb.js');
const firebaseAdminPath = path.resolve(__dirname, '../src/config/firebaseAdmin.js');
const userDataServicePath = path.resolve(__dirname, '../src/services/userDataService.js');

function setupTest() {
  const store = new Map();

  const mockDb = {
    collection: (colName) => ({
      doc: (docId) => ({
        get: async () => {
          const data = store.get(`${colName}/${docId}`);
          return {
            exists: Boolean(data),
            id: docId,
            data: () => data,
            ref: { id: docId },
          };
        },
        set: async (payload, opts) => {
          const key = `${colName}/${docId}`;
          const existing = store.get(key) || {};
          store.set(key, opts?.merge ? { ...existing, ...payload } : payload);
        },
        collection: () => ({
          orderBy: () => ({
            limit: () => ({
              get: async () => ({ docs: [] }),
            }),
          }),
        }),
      }),
      where: (field, op, val) => ({
        orderBy: () => ({
          limit: () => ({
            get: async () => {
              const docs = [];
              for (const [key, data] of store.entries()) {
                if (key.startsWith(`${colName}/`) && data[field] === val) {
                  const id = key.split('/')[1];
                  docs.push({ id, data: () => data });
                }
              }
              return { docs };
            },
          }),
        }),
      }),
    }),
  };

  const mockFirebaseAdmin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => new Date().toISOString(),
      },
      Timestamp: {
        now: () => ({ toDate: () => new Date() }),
      },
    },
  };

  delete require.cache[servicePath];
  delete require.cache[firestoreDbPath];
  delete require.cache[firebaseAdminPath];
  delete require.cache[userDataServicePath];

  require.cache[firestoreDbPath] = { exports: { getDb: () => mockDb } };
  require.cache[firebaseAdminPath] = { exports: mockFirebaseAdmin };
  require.cache[userDataServicePath] = { exports: { mergeUserDoc: async () => {}, getUserDoc: async () => null } };

  const service = require(servicePath);

  return {
    service,
    store,
    restore() {
      delete require.cache[servicePath];
      delete require.cache[firestoreDbPath];
      delete require.cache[firebaseAdminPath];
      delete require.cache[userDataServicePath];
    },
  };
}

test('getOrCreateMine does not create a Firestore document for unstarted conversations', async () => {
  const { service, store, restore } = setupTest();
  try {
    const user = { uid: 'user_123', name: 'Test Agent', email: 'agent@test.com' };
    const res = await service.getOrCreateMine(user);

    assert.equal(res.conversation.id, 'user_123');
    assert.equal(res.conversation.status, 'idle');
    assert.equal(res.conversation.messageCount, 0);
    assert.deepEqual(res.messages, []);

    // Crucial check: verify nothing was written to Firestore!
    assert.equal(store.has('supportConversations/user_123'), false);
  } finally {
    restore();
  }
});

test('listConversations excludes conversations with zero messages and no preview', async () => {
  const { service, store, restore } = setupTest();
  try {
    // 1 empty waiting conversation (the bug)
    store.set('supportConversations/empty_user', {
      userId: 'empty_user',
      userName: 'Empty User',
      status: 'waiting',
      messageCount: 0,
      lastMessagePreview: '',
      lastMessageAt: new Date().toISOString(),
    });

    // 1 real waiting conversation with a message
    store.set('supportConversations/real_user', {
      userId: 'real_user',
      userName: 'Real User',
      status: 'waiting',
      messageCount: 1,
      lastMessagePreview: 'Need help with billing',
      lastMessageAt: new Date().toISOString(),
    });

    const rows = await service.listConversations({ status: 'inbox' });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'real_user');
    assert.equal(rows[0].lastMessagePreview, 'Need help with billing');
  } finally {
    restore();
  }
});
