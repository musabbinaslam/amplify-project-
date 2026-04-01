import { create } from 'zustand';

const STORAGE_KEY = 'agentcalls_auth';

const loadPersistedAuth = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { user, token } = JSON.parse(raw);
      if (user && token) return { user, token };
    }
  } catch { /* corrupted storage */ }
  return { user: null, token: null };
};

const persist = (user, token) => {
  if (user && token) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
};

const initial = loadPersistedAuth();

const useAuthStore = create((set, get) => ({
  user: initial.user,
  token: initial.token,

  get isAuthenticated() {
    return !!get().token;
  },

  signup: (formData) => {
    const user = {
      id: `agent_${Date.now()}`,
      name: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      verticals: formData.verticals,
    };
    const token = `mock_token_${Date.now()}`;
    persist(user, token);
    set({ user, token });
  },

  login: (email, password) => {
    const user = {
      id: `agent_${Date.now()}`,
      name: email.split('@')[0],
      email,
    };
    const token = `mock_token_${Date.now()}`;
    persist(user, token);
    set({ user, token });
  },

  logout: () => {
    persist(null, null);
    set({ user: null, token: null });
  },
}));

export default useAuthStore;
