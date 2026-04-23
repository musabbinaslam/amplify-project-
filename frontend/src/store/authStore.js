import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  sendPasswordResetEmail,
  getAdditionalUserInfo,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { getProfile, saveProfile } from '../services/profileService';
import { useThemeStore } from './themeStore';

const mapFirebaseUser = (firebaseUser) => ({
  uid: firebaseUser.uid,
  name: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
  email: firebaseUser.email,
  avatar: firebaseUser.photoURL,
  authProvider: firebaseUser.providerData[0]?.providerId || 'password',
});

async function loadUserRole(uid) {
  try {
    const profile = await getProfile(uid);
    if (profile?.brandColor) {
      try { useThemeStore.getState().hydrateFromProfile(profile.brandColor); } catch {}
    }
    return profile?.role === 'admin' ? 'admin' : 'agent';
  } catch {
    return 'agent';
  }
}

const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  loading: true,

  initAuth: () => {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const token = await firebaseUser.getIdToken();
          const existingMeta = get().user?.meta;
          const role = await loadUserRole(firebaseUser.uid);
          set({
            user: { ...mapFirebaseUser(firebaseUser), meta: existingMeta || null, role },
            token,
            loading: false,
          });
        } else {
          set({ user: null, token: null, loading: false });
        }
        resolve();
      });
      set({ _unsubscribe: unsubscribe });
    });
  },

  signup: async (formData) => {
    const { email, password, fullName } = formData;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: fullName });
    const token = await credential.user.getIdToken();

    const saved = await saveProfile(credential.user.uid, {
      onboarding: {
        phone: formData.phone || '',
        weeklySpend: formData.weeklySpend || '',
        usedInbound: formData.usedInbound || '',
        verticals: formData.verticals || '',
        hearAbout: formData.hearAbout || '',
        completedAt: new Date().toISOString(),
      },
    });
    const role = saved?.role === 'admin' ? 'admin' : 'agent';

    set({
      user: { ...mapFirebaseUser(credential.user), name: fullName, role },
      token,
    });
  },

  login: async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdToken();
    const role = await loadUserRole(credential.user.uid);
    set({ user: { ...mapFirebaseUser(credential.user), role }, token });
  },

  googleLogin: async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const token = await result.user.getIdToken();

    const existing = await getProfile(result.user.uid);
    const needsOnboarding = !existing?.onboarding?.completedAt;

    const role = await loadUserRole(result.user.uid);
    set({ user: { ...mapFirebaseUser(result.user), role }, token });
    return { needsOnboarding, user: result.user };
  },

  /** Login page only: reject first-time Google users (must use Sign up first). */
  googleSignIn: async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const info = getAdditionalUserInfo(result);

    if (info?.isNewUser) {
      try {
        await deleteUser(result.user);
      } catch {
        await signOut(auth);
      }
      const err = new Error('No account found for this Google account. Please sign up first.');
      err.code = 'auth/no-account-yet';
      throw err;
    }

    const token = await result.user.getIdToken();
    const existing = await getProfile(result.user.uid);
    const needsOnboarding = !existing?.onboarding?.completedAt;
    const role = await loadUserRole(result.user.uid);

    set({ user: { ...mapFirebaseUser(result.user), role }, token });
    return { needsOnboarding, user: result.user };
  },

  saveGoogleOnboarding: async (formData) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No authenticated user');
    await saveProfile(currentUser.uid, {
      onboarding: {
        phone: formData.phone || '',
        weeklySpend: formData.weeklySpend || '',
        usedInbound: formData.usedInbound || '',
        verticals: formData.verticals || '',
        hearAbout: formData.hearAbout || '',
        completedAt: new Date().toISOString(),
      },
    });
  },

  logout: async () => {
    await signOut(auth);
    set({ user: null, token: null });
    try { useThemeStore.getState().resetBrand(); } catch {}
  },

  resetPassword: async (email) => {
    await sendPasswordResetEmail(auth, email);
  },

  getIdToken: async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  },

  /** Re-fetch role from Firestore (e.g. after admin promotion in Console). */
  refreshUserRole: async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const role = await loadUserRole(currentUser.uid);
    set((state) => ({
      user: state.user ? { ...state.user, role } : null,
    }));
  },

  updateAvatar: (url) => {
    set((state) => ({
      user: state.user ? { ...state.user, avatar: url } : null,
    }));
  },

  updateName: async (displayName) => {
    await updateProfile(auth.currentUser, { displayName });
    set((state) => ({
      user: state.user ? { ...state.user, name: displayName } : null,
    }));
  },

  updateEmailAddress: async (newEmail, currentPassword) => {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updateEmail(auth.currentUser, newEmail);
    set((state) => ({
      user: state.user ? { ...state.user, email: newEmail } : null,
    }));
  },

  changePassword: async (currentPassword, newPassword) => {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
  },

  deleteAccount: async (currentPassword) => {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await deleteUser(auth.currentUser);
    set({ user: null, token: null });
  },
}));

export default useAuthStore;
