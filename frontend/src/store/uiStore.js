import { create } from 'zustand';

const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
};

export const useUIStore = create((set, get) => ({
  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  theme: localStorage.getItem('theme') || 'dark',

  initTheme: () => {
    applyTheme(get().theme);
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
    set({ theme: next });
  },
}));
