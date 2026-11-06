import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';

// Vite resolves extensionless relative imports; Node's ESM loader does not.
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

const TOKEN_REFRESH_MS = 15 * 60 * 1000;

const authStateListeners = [];
const sentry = { setUser: mock.fn() };
const firebaseAuth = { currentUser: null };
const mockCtl = {
  additionalUserInfo: { isNewUser: false },
  profile: null,
  signInWithPopup: null,
  forceToken: 'fresh-token',
  idToken: 'id-token',
};

function completeProfile(overrides = {}) {
  return {
    onboarding: { completedAt: '2024-01-01T00:00:00.000Z' },
    meta: { plan: 'test' },
    role: 'agent',
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    uid: 'user-1',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    photoURL: null,
    providerData: [{ providerId: 'google.com' }],
    getIdToken: async (forceRefresh = false) => (forceRefresh ? mockCtl.forceToken : mockCtl.idToken),
    ...overrides,
  };
}

async function fireAuthState(user) {
  firebaseAuth.currentUser = user;
  await Promise.all(authStateListeners.map((cb) => cb(user)));
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

mock.module('firebase/auth', {
  namedExports: {
    createUserWithEmailAndPassword: async () => { throw new Error('unused'); },
    signInWithEmailAndPassword: async () => {
      const user = makeUser({
        providerData: [{ providerId: 'password' }],
      });
      await fireAuthState(user);
      return { user };
    },
    signInWithPopup: async (...args) => {
      if (typeof mockCtl.signInWithPopup === 'function') {
        return mockCtl.signInWithPopup(...args);
      }
      const user = makeUser();
      await fireAuthState(user);
      return { user };
    },
    signOut: async () => {
      await fireAuthState(null);
    },
    onAuthStateChanged: (_auth, cb) => {
      authStateListeners.push(cb);
      return () => {
        const idx = authStateListeners.indexOf(cb);
        if (idx >= 0) authStateListeners.splice(idx, 1);
      };
    },
    updateProfile: async () => {},
    updateEmail: async () => {},
    updatePassword: async () => {},
    reauthenticateWithCredential: async () => {},
    EmailAuthProvider: { credential: () => ({}) },
    deleteUser: async () => {},
    sendPasswordResetEmail: async () => {},
    sendEmailVerification: async () => {},
    getAdditionalUserInfo: () => mockCtl.additionalUserInfo,
  },
});

mock.module('@sentry/react', {
  defaultExport: sentry,
  namedExports: { setUser: (...args) => sentry.setUser(...args) },
});

mock.module(new URL('../config/firebase.js', import.meta.url).href, {
  namedExports: {
    auth: firebaseAuth,
    googleProvider: { providerId: 'google.com' },
  },
});

mock.module(new URL('../services/profileService.js', import.meta.url).href, {
  namedExports: {
    getProfile: async () => mockCtl.profile,
    saveProfile: async () => ({}),
    sendWelcomeEmail: async () => {},
  },
});

let useAuthStore;

before(async () => {
  ({ default: useAuthStore } = await import('./authStore.js'));
});

afterEach(() => {
  const interval = useAuthStore.getState()._tokenRefreshInterval;
  if (interval) clearInterval(interval);
  useAuthStore.setState({
    user: null,
    token: null,
    loading: true,
    googleLoginValidationInProgress: false,
    _tokenRefreshInterval: null,
  });
  authStateListeners.splice(0);
  sentry.setUser.mock.resetCalls();
  mockCtl.additionalUserInfo = { isNewUser: false };
  mockCtl.profile = null;
  mockCtl.signInWithPopup = null;
  mockCtl.forceToken = 'fresh-token';
  mockCtl.idToken = 'id-token';
  firebaseAuth.currentUser = null;
  mock.timers.reset();
});

function assertNoMaintenance() {
  const state = useAuthStore.getState();
  assert.equal(state._tokenRefreshInterval, null);
  assert.equal(state.user, null);
  assert.equal(state.token, null);
  const userSets = sentry.setUser.mock.calls.filter((call) => call.arguments[0]?.id);
  assert.equal(userSets.length, 0);
}

async function bootLoggedOut() {
  const ready = useAuthStore.getState().initAuth();
  await fireAuthState(null);
  await ready;
}

test('googleSignIn success: missed auth callback still arms refresh and updates store.token', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  mockCtl.profile = completeProfile();
  mockCtl.signInWithPopup = async () => {
    const user = makeUser();
    // Missed-callback sequence: listener fires while the eligibility lock is on,
    // then does not fire again after googleSignIn commits.
    await fireAuthState(user);
    return { user };
  };

  await bootLoggedOut();
  const { needsOnboarding } = await useAuthStore.getState().googleSignIn();

  const state = useAuthStore.getState();
  assert.equal(needsOnboarding, false);
  assert.equal(state.googleLoginValidationInProgress, false);
  assert.equal(state.token, 'id-token');
  assert.equal(state.user?.uid, 'user-1');
  assert.ok(state._tokenRefreshInterval);
  assert.equal(sentry.setUser.mock.calls.at(-1).arguments[0].id, 'user-1');

  mock.timers.tick(TOKEN_REFRESH_MS);
  await flush();
  assert.equal(useAuthStore.getState().token, 'fresh-token');
});

test('rejected Google accounts never acquire session maintenance', async () => {
  mock.timers.enable({ apis: ['setInterval'] });

  await bootLoggedOut();
  mockCtl.additionalUserInfo = { isNewUser: true };
  mockCtl.profile = completeProfile();
  await assert.rejects(
    () => useAuthStore.getState().googleSignIn(),
    (err) => err.code === 'auth/no-account-yet',
  );
  assertNoMaintenance();
  assert.equal(useAuthStore.getState().googleLoginValidationInProgress, false);

  mockCtl.additionalUserInfo = { isNewUser: false };
  mockCtl.profile = { onboarding: {} };
  await assert.rejects(
    () => useAuthStore.getState().googleSignIn(),
    (err) => err.code === 'auth/no-account-yet',
  );
  assertNoMaintenance();
});

test('googleSignIn cancellation clears the lock and does not start maintenance', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  mockCtl.signInWithPopup = async () => {
    const err = new Error('Popup closed');
    err.code = 'auth/popup-closed-by-user';
    throw err;
  };

  await bootLoggedOut();
  await assert.rejects(
    () => useAuthStore.getState().googleSignIn(),
    (err) => err.code === 'auth/popup-closed-by-user',
  );
  assertNoMaintenance();
  assert.equal(useAuthStore.getState().googleLoginValidationInProgress, false);
});

test('logout after validated Google login clears the refresh interval', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  mockCtl.profile = completeProfile();

  await bootLoggedOut();
  await useAuthStore.getState().googleSignIn();
  assert.ok(useAuthStore.getState()._tokenRefreshInterval);

  await useAuthStore.getState().logout();
  const state = useAuthStore.getState();
  assert.equal(state._tokenRefreshInterval, null);
  assert.equal(state.user, null);
  assert.equal(state.token, null);
  assert.equal(sentry.setUser.mock.calls.at(-1).arguments[0], null);
});

test('repeated auth events replace the existing refresh interval', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  mockCtl.profile = completeProfile();
  mockCtl.forceToken = 'fresh-1';

  await bootLoggedOut();
  await useAuthStore.getState().googleSignIn();
  const firstInterval = useAuthStore.getState()._tokenRefreshInterval;
  assert.ok(firstInterval);

  mockCtl.forceToken = 'fresh-2';
  await fireAuthState(makeUser());
  const secondInterval = useAuthStore.getState()._tokenRefreshInterval;
  assert.ok(secondInterval);
  assert.notEqual(secondInterval, firstInterval);

  mock.timers.tick(TOKEN_REFRESH_MS);
  await flush();
  assert.equal(useAuthStore.getState().token, 'fresh-2');
});

test('password login still gets session maintenance from onAuthStateChanged', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  mockCtl.profile = completeProfile();

  await bootLoggedOut();
  await useAuthStore.getState().login('ada@example.com', 'secret');

  const state = useAuthStore.getState();
  assert.equal(state.token, 'id-token');
  assert.equal(state.user?.uid, 'user-1');
  assert.ok(state._tokenRefreshInterval);
  assert.equal(state.googleLoginValidationInProgress, false);

  mockCtl.forceToken = 'pw-fresh';
  mock.timers.tick(TOKEN_REFRESH_MS);
  await flush();
  assert.equal(useAuthStore.getState().token, 'pw-fresh');
});
