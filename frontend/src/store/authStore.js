import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';

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
    const { email, password, fullName, ...meta } = formData;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: fullName });
    const token = await credential.user.getIdToken();
    set({
      user: {
        ...mapFirebaseUser(credential.user),
        name: fullName,
        meta: {
          phone: formData.phone,
          verticals: formData.verticals,
          weeklySpend: formData.weeklySpend,
          usedInbound: formData.usedInbound,
          hearAbout: formData.hearAbout,
        },
      },
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
    set({ user: mapFirebaseUser(result.user), token });
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
}));

export default useAuthStore;
