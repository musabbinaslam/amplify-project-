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
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { saveOnboarding, getOnboarding } from '../services/onboardingService';

const mapFirebaseUser = (firebaseUser) => ({
  uid: firebaseUser.uid,
  name: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
  email: firebaseUser.email,
  avatar: firebaseUser.photoURL,
  authProvider: firebaseUser.providerData[0]?.providerId || 'password',
});

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
          set({
            user: { ...mapFirebaseUser(firebaseUser), meta: existingMeta || null },
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

    await saveProfile(credential.user.uid, {
      onboarding: {
        phone: formData.phone || '',
        weeklySpend: formData.weeklySpend || '',
        usedInbound: formData.usedInbound || '',
        verticals: formData.verticals || '',
        hearAbout: formData.hearAbout || '',
        completedAt: new Date().toISOString(),
      },
    });

    set({
      user: { ...mapFirebaseUser(credential.user), name: fullName },
      token,
    });
  },

  login: async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdToken();
    set({ user: mapFirebaseUser(credential.user), token });
  },

  googleLogin: async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const token = await result.user.getIdToken();

    const existing = await getProfile(result.user.uid);
    const needsOnboarding = !existing?.onboarding?.completedAt;

    set({ user: mapFirebaseUser(result.user), token });
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
  },

  resetPassword: async (email) => {
    await sendPasswordResetEmail(auth, email);
  },

  getIdToken: async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
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
