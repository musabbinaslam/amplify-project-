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

function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalize(hex) {
  const v = String(hex || '').trim().toLowerCase();
  return HEX_RE.test(v) ? v : DEFAULT_BRAND;
}

/* ── WCAG luminance helpers ───────────────────────────────────────────── */

function srgbChannelToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
}

function relLuminanceFromRgb({ r, g, b }) {
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hexA, hexB) {
  const la = relLuminanceFromRgb(hexToRgb(hexA));
  const lb = relLuminanceFromRgb(hexToRgb(hexB));
  const [lo, hi] = la > lb ? [lb, la] : [la, lb];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Darken a hex toward black in linear-light space until its relative
 * luminance is at or below `targetL`. If already below, return as-is.
 */
function darkenToLuminance(hex, targetL) {
  const { r, g, b } = hexToRgb(hex);
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  if (L <= targetL) return hex;
  const scale = targetL / L;
  return rgbToHex({
    r: linearChannelToSrgb(R * scale),
    g: linearChannelToSrgb(G * scale),
    b: linearChannelToSrgb(B * scale),
  });
}

/* ── Token application ────────────────────────────────────────────────── */

function currentTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyBrand(hex) {
  if (typeof document === 'undefined') return;
  const clean = normalize(hex);
  const { r, g, b } = hexToRgb(clean);
  const theme = currentTheme();

  // In light mode we darken the identity color enough that white text clears
  // ~4.5:1, and we darken again for surface-text use against a light tint.
  const brandSolid = theme === 'light' ? darkenToLuminance(clean, 0.18) : clean;
  const brandText = theme === 'light' ? darkenToLuminance(clean, 0.22) : clean;

  // Foreground for text that sits *on* --brand-solid: pick whichever of
  // white/near-black scores higher contrast.
  const contrastVsWhite = contrastRatio(brandSolid, '#ffffff');
  const contrastVsBlack = contrastRatio(brandSolid, '#0b0b0b');
  const brandOn = contrastVsWhite >= contrastVsBlack ? '#ffffff' : '#0b0b0b';

  const root = document.documentElement.style;
  root.setProperty('--brand', clean);
  root.setProperty('--brand-dim', `rgba(${r}, ${g}, ${b}, 0.15)`);
  root.setProperty('--brand-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
  root.setProperty('--brand-solid', brandSolid);
  root.setProperty('--brand-text', brandText);
  root.setProperty('--brand-on', brandOn);
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

// Recompute role tokens whenever the theme attribute flips, so a single
// brand hex yields theme-appropriate solid/text/on values in light + dark.
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    applyBrand(useThemeStore.getState().brandColor);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}
