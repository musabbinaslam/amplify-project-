const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const controllerPath = path.resolve(__dirname, '../src/controllers/userController.js');
const userDataServicePath = path.resolve(__dirname, '../src/services/userDataService.js');
const firebaseAdminPath = path.resolve(__dirname, '../src/config/firebaseAdmin.js');

function loadPatchMeWithMocks({ existingProfile, mergedProfile }) {
  let getUserDocCall = 0;
  const mergeCalls = [];
  const activityCalls = [];

  const mockUserDataService = {
    getUserDoc: async () => {
      getUserDocCall += 1;
      if (getUserDocCall === 1) return existingProfile;
      return mergedProfile;
    },
    mergeUserDoc: async (uid, body) => {
      mergeCalls.push({ uid, body });
    },
    mergeSettings: async () => ({}),
    mergeScriptValues: async () => ({}),
    getOrCreateApiKey: async () => 'test_key',
    regenerateApiKey: async () => 'test_key_rotated',
    isSlugAvailable: async () => true,
    addActivity: async (uid, entry) => {
      activityCalls.push({ uid, entry });
    },
    listActivity: async () => [],
  };

  const mockFirebaseAdmin = {
    firestore: {
      Timestamp: class Timestamp {},
    },
  };

  delete require.cache[controllerPath];
  delete require.cache[userDataServicePath];
  delete require.cache[firebaseAdminPath];
  require.cache[userDataServicePath] = { exports: mockUserDataService };
  require.cache[firebaseAdminPath] = { exports: mockFirebaseAdmin };

  const { patchMe } = require(controllerPath);

  return {
    patchMe,
    mergeCalls,
    activityCalls,
    restore() {
      delete require.cache[controllerPath];
      delete require.cache[userDataServicePath];
      delete require.cache[firebaseAdminPath];
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('patchMe preserves existing admin role on profile update', async () => {
  const { patchMe, mergeCalls, restore } = loadPatchMeWithMocks({
    existingProfile: { role: 'admin' },
    mergedProfile: { role: 'admin', bio: 'updated' },
  });

  const req = {
    user: { uid: 'user_admin_1' },
    body: { bio: 'updated' },
  };
  const res = createRes();

  try {
    await patchMe(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(mergeCalls.length, 1);
    assert.equal(mergeCalls[0].uid, 'user_admin_1');
    assert.equal(mergeCalls[0].body.role, undefined);
    assert.equal(mergeCalls[0].body.bio, 'updated');
    assert.equal(res.body.role, 'admin');
  } finally {
    restore();
  }
});

test('patchMe assigns default agent role only for first write', async () => {
  const { patchMe, mergeCalls, restore } = loadPatchMeWithMocks({
    existingProfile: null,
    mergedProfile: { role: 'agent', bio: 'hello' },
  });

  const req = {
    user: { uid: 'user_new_1' },
    body: { bio: 'hello' },
  };
  const res = createRes();

  try {
    await patchMe(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(mergeCalls.length, 1);
    assert.equal(mergeCalls[0].uid, 'user_new_1');
    assert.equal(mergeCalls[0].body.role, 'agent');
    assert.equal(mergeCalls[0].body.bio, 'hello');
    assert.equal(res.body.role, 'agent');
  } finally {
    restore();
  }
});
