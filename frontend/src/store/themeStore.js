import { create } from 'zustand';

export const DEFAULT_BRAND = '#25f425';
const STORAGE_KEY = 'brandColor';
const HEX_RE = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex) {
  const h = String(hex || '').trim().replace(/^#/, '');
  if (h.length !== 6) return { r: 37, g: 244, b: 37 };
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return { r: 37, g: 244, b: 37 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function normalize(hex) {
  const v = String(hex || '').trim().toLowerCase();
  return HEX_RE.test(v) ? v : DEFAULT_BRAND;
}

function applyBrand(hex) {
  if (typeof document === 'undefined') return;
  const clean = normalize(hex);
  const { r, g, b } = hexToRgb(clean);
  const root = document.documentElement.style;
  root.setProperty('--brand', clean);
  root.setProperty('--brand-dim', `rgba(${r}, ${g}, ${b}, 0.15)`);
  root.setProperty('--brand-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
}

function readInitialBrand() {
  if (typeof localStorage === 'undefined') return DEFAULT_BRAND;
  const stored = localStorage.getItem(STORAGE_KEY);
  return HEX_RE.test(stored || '') ? stored.toLowerCase() : DEFAULT_BRAND;
}

export const useThemeStore = create((set, get) => ({
  brandColor: readInitialBrand(),

  initBrand: () => {
    applyBrand(get().brandColor);
  },

  setBrandColor: (hex) => {
    const clean = normalize(hex);
    try { localStorage.setItem(STORAGE_KEY, clean); } catch {}
    applyBrand(clean);
    set({ brandColor: clean });
  },

  resetBrand: () => {
    get().setBrandColor(DEFAULT_BRAND);
  },

  hydrateFromProfile: (profileHex) => {
    if (!profileHex) return;
    const v = String(profileHex).trim().toLowerCase();
    if (!HEX_RE.test(v)) return;
    if (v === get().brandColor) return;
    get().setBrandColor(v);
  },
}));
