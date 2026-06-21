# CallsFlow UI Design System

Design reference extracted from the redesigned Dashboard. Use this document when updating any authenticated `/app` screen so the product feels cohesive.

**Reference implementations:**
- App shell — [AppShell.jsx](../src/components/layout/AppShell.jsx) + [ambient.css](../src/styles/ambient.css) (global brand gradient)
- Dashboard — [DashboardPage.jsx](../src/pages/DashboardPage.jsx) + [DashboardPage.module.css](../src/pages/DashboardPage.module.css)
- Welcome — [WelcomePage.jsx](../src/pages/WelcomePage.jsx) + [WelcomePage.module.css](../src/pages/WelcomePage.module.css)

**Token source of truth:** [variables.css](../src/styles/variables.css)  
**Motion source of truth:** [appMotion.js](../src/motion/appMotion.js)

---

## 1. Design principles

1. **Dark-first, brand-green accent** — One primary accent (`--brand-text`). Cyan is secondary and reserved for data contrast (e.g. a second chart series), not decorative UI chrome.
2. **Depth through surface, not shadow** — On near-black backgrounds, drop shadows band and look cheap. Elevate cards with surface tier + hairline border + inset top highlight.
3. **Restrained color** — No rainbow KPI bars, no per-card accent colors, no heavy glow rings on icons. Semantic color only (success / warning / error / neutral).
4. **Data when it exists** — Hide sparklines and chart strokes at zero; show intentional empty states instead of flat colored lines at card edges.
5. **Motion with purpose** — Short, opacity-first animations. Always respect `prefers-reduced-motion`.
6. **Token-driven** — Never hardcode hex values in page CSS when a token exists. Brand color is user-customizable at runtime via `themeStore`.

---

## 2. Color system

### Surfaces (dark theme)

| Token | Hex | Use |
|-------|-----|-----|
| `--surface` | `#0e0e0e` | Page background |
| `--surface-container-low` | `#131313` | Cards, panels |
| `--surface-container` | `#1a1a1a` | Hover state on cards |
| `--surface-container-high` | `#202020` | Nested elements, table headers |
| `--surface-container-highest` | `#262626` | Dropdowns, tooltips |

Stack surfaces one tier lighter for hover/nested content. Do not jump more than one tier at a time.

### Brand & accents

| Token | Role |
|-------|------|
| `--brand-text` | Primary accent: icons, links, prices, primary chart series, active states |
| `--brand-dim` | Subtle ambient wash (page background glow) |
| `--brand-glow` | Hover glow on floating controls only (dropdowns), not card shadows |
| `--accent-cyan` | Secondary data series, outbound call badges |
| `--accent-green` | Positive trend / success |
| `--accent-red` | Negative trend / errors / not interested |
| `--accent-yellow` | Callback / warning dispositions |

### Text

| Token | Use |
|-------|-----|
| `--text-primary` | Headings, KPI values, table primary cells |
| `--text-secondary` | Labels, subtitles, legend text |
| `--text-tertiary` | Muted meta (buffer times, timestamps) |

### Borders

```css
border: 1px solid color-mix(in srgb, #ffffff 7%, transparent); /* card default */
border: 1px solid var(--border); /* ghost border for tables/dividers */
border-color: var(--brand-text); /* focus / active only */
```

Light theme overrides live in `[data-theme="light"]` inside `variables.css`. All page styles must use tokens so light mode works without a separate stylesheet.

---

## 3. Typography

**Font:** `Outfit` (loaded in [global.css](../src/styles/global.css))

| Role | Size | Weight | Extras |
|------|------|--------|--------|
| KPI / hero number | 34px | 800 | `letter-spacing: -0.03em` |
| Section stat value | 27–32px | 800 | `letter-spacing: -0.02em` to `-0.03em` |
| Section title (`h3`) | 20px | 700 | Icon + 12px gap |
| Chart header value | 28px | 800 | Optional muted sub-label at 14px / 600 |
| Card price | 29px | 800 | Brand color |
| Label (uppercase) | 12–12.5px | 600 | `text-transform: uppercase; letter-spacing: 0.06em` |
| Body / table cell | 13–14px | 400–500 | — |
| Table header | 0.72rem | 600 | Uppercase, muted |
| Badge / pill | 12px | 700 | — |

Numbers are the hero. Labels stay small, uppercase, and secondary-colored.

---

## 4. Spacing & layout

### Page rhythm

```css
.pageRoot {
  display: flex;
  flex-direction: column;
  gap: 24px;        /* desktop section gap */
  padding-bottom: 32px;
}
```

| Breakpoint | Section gap | Card padding |
|------------|-------------|--------------|
| Desktop (>1024px) | 24px | 28px (sections), 20px (KPI) |
| Tablet (≤1024px) | 18–20px | 24px |
| Small tablet (≤768px) | 16–20px | 20px |
| Mobile (≤480px) | 16px | 16px |

### Grid patterns (dashboard)

| Layout | Columns | Gap |
|--------|---------|-----|
| KPI strip | `repeat(4, 1fr)` → 2 → 2 on mobile | 18px → 12px → 10px |
| Performance band | `1fr 1fr 1.4fr` | 18px |
| Charts row | `1.7fr 1fr` | 18px |
| Campaign grid | `repeat(3, 1fr)` → 2 → 1 | 18px |

Use `18px` as the default card grid gap across dashboard-style layouts.

### Radii

| Token | Use |
|-------|-----|
| `--radius-xl` (16px) | Cards, sections |
| `--radius-lg` (12px) | Icon containers, campaign cards, dropdown panels |
| `--radius-md` (8px) | Dropdown items, tooltips |
| `--radius-full` | Pills, badges, dropdown triggers |

---

## 5. Card surface (`.glass`)

Global primitive in [surfaces.css](../src/styles/surfaces.css), imported via [global.css](../src/styles/global.css). Theme tokens live in [variables.css](../src/styles/variables.css) (`--glass-*`).

Apply alongside page-specific CSS module classes:

```jsx
<div className={`glass ${classes.kpiCard}`} />
```

### Base card

```css
.glass {
  position: relative;
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--glass-highlight), var(--glass-edge);
  transition: background 0.22s ease, border-color 0.22s ease;
}

.glass:hover {
  background: var(--glass-bg-hover);
  border-color: color-mix(in srgb, var(--brand-text) 18%, var(--glass-border));
}
```

### Glass tokens (dark / light)

| Token | Dark | Light |
|-------|------|-------|
| `--glass-bg` | 52% `--surface-container-low` + transparent | 54% `--surface-container-low` + transparent |
| `--glass-border` | 14% white mix | 8% black mix (defines edge on light bg) |
| `--glass-highlight` | `inset 0 1px 0 rgba(255,255,255,0.12)` | `inset 0 1px 0 rgba(255,255,255,0.72)` |
| `--glass-edge` | `0 1px 0 rgba(0,0,0,0.25)` | `0 1px 0 rgba(0,0,0,0.07)` (hairline — not drop shadow) |

The AppShell `.appAmbient` gradient (see §6) gives `backdrop-filter` content to frost against across sidebar, topbar, and main content.

### Depth rules — do and don't

| Do | Don't |
|----|-------|
| Translucent fill + `backdrop-filter` blur | Solid opaque `--surface-container-low` fill |
| Theme `--glass-*` tokens for border/highlight/edge | White-on-white borders in light mode |
| Dark rim (`10% black`) on light cards for edge definition | Light mode `::before` top sheen gradient |
| Inset top highlight via `--glass-highlight` | Stacked outer `box-shadow` layers on cards |
| 1px dark separator (`--glass-edge`) in dark mode | `::before` + `filter: blur()` fake shadows |
| Ambient page wash behind cards | Per-card colored top accent bars |
| Shadow on floating overlays only (dropdowns, tooltips, modals) | Heavy outer glow on every icon |

Floating overlays (menus, tooltips) may use a single soft shadow because they sit above the page:

```css
box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
```

---

## 6. Ambient page background

One subtle brand gradient behind the **entire authenticated app** — not per page, not per card.

**Where:** [AppShell.jsx](../src/components/layout/AppShell.jsx) applies `appAmbient` on `.appContainer`. Styles live in [ambient.css](../src/styles/ambient.css).

**Why AppShell:** Glass sidebar, topbar, and cards use `backdrop-filter`. They need a tinted layer behind them. `mainContent` must stay `background: transparent` so the gradient shows through.

**Tokens:** Uses `--brand` and `--brand-dim` from [themeStore.js](../src/store/themeStore.js). Color updates instantly when the user changes accent in Settings — no save required for preview.

**Formula** — one full-viewport `::before` layer with three soft radial stops, `filter: blur(64px)` (no visible blob edges), and a 60s drift (~1.2% translate). Brand-only; no `--accent-cyan`.

- `@media (prefers-reduced-motion: reduce)` — animation off

Light mode uses slightly **stronger** ambient stops (30% / 17% / 11%) so the wash matches dark-mode visual weight on pale surfaces. Do not use unblurred circular pseudo-elements — they read as hard shapes behind glass.

Base surface remains `var(--surface)` on `.appContainer` for contrast fallback.

**Do not** add per-page `::before` ambient washes — they double-stack and miss the sidebar/topbar area.

---

## 7. Components

### 7.1 KPI card

Structure: icon + trend pill → uppercase label → large value → optional sparkline.

```
┌─────────────────────────────┐
│ [icon]              [+12%]  │
│ TODAY'S CALLS               │
│ 42                          │
│ ▁▂▃▅▇ (sparkline, faded)   │
└─────────────────────────────┘
```

- Icon box: 42×42, `--radius-lg`, brand fill at 14% opacity + 22% border.
- Sparkline: brand stroke only; **hidden when all values are 0**; fade out with `mask-image: linear-gradient(to bottom, black 40%, transparent)`.
- Hover: `whileHover={{ y: -3 }}` via Framer Motion (skip when reduced motion).

### 7.2 Trend pill

Glass chip for period-over-period delta.

| State | Color tokens |
|-------|--------------|
| Up | `--accent-green` bg 12%, border 24% |
| Down | `--accent-red` |
| Flat | `--text-tertiary` |

### 7.3 Icon container (shared pattern)

Used on KPI, stat tiles, chart headers, campaign cards:

```css
.iconBox {
  width: 42px; /* 38px stat tile, 46px chart header */
  height: 42px;
  border-radius: var(--radius-lg);
  color: var(--brand-text);
  background: color-mix(in srgb, var(--brand-text) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand-text) 22%, transparent);
}
```

### 7.4 Radial gauge

- Arc: `innerRadius 68%`, `outerRadius 92%`, corner radius 999.
- Fill: linear gradient `--brand-text` at 55% → 100% opacity.
- Track: `color-mix(in srgb, var(--surface-container-highest) 80%, transparent)`.
- Center: count-up value + uppercase label inside the ring.
- Both gauges use brand green — do not color-code gauges differently.

### 7.5 Section header

```css
.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.sectionHeader h3 {
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
}
```

Pair with a text action on the right (`View All`, period filter).

### 7.6 Dropdown (pill trigger + glass menu)

- Trigger: pill shape (`--radius-full`), blurred translucent bg, brand border on hover.
- Menu: `--radius-lg`, 8px padding, `AnimatePresence` + `dropdownPanelMotion`.
- Active item: `color-mix(in srgb, var(--brand-text) 12%, transparent)`.

### 7.7 Status badges (tables)

Pill shape, 0.72rem / 600, semantic background at ~14% opacity:

| Status | Color |
|--------|-------|
| Sold / Inbound | `--brand-text` |
| Callback | `--accent-yellow` |
| Not Interested / Missed | `--accent-red` |
| No Answer | `--text-muted` |
| Outbound | `--accent-cyan` |

### 7.8 Data table

- Header row: 50% `--surface-container-high` mix, uppercase muted labels.
- Row hover: 35% `--surface-container-high` mix.
- Primary cell: `--text-primary` / 600 weight.
- Mono font for IDs/phones: `'SF Mono', 'Fira Code', monospace`.

### 7.9 Empty & error states

- Empty chart/table: centered, `--text-muted`, 14px — *"No calls in this period yet."*
- Error banner: red 10% bg, 40% border, `--radius-lg`.
- Loading: `PageLoader` on first paint; inline spinner for section-level loads.

### 7.10 Welcome page

Simple onboarding screen: hero greeting + single glass tutorial card with embedded video.

**Page shell**
- Content inherits AppShell ambient gradient (§6) — no per-page wash.
- `.contentColumn`: `width: min(100%, 880px); margin-inline: auto`.

**Hero**
- Title: 28px / 800 desktop → 22px mobile; subtitle 14px secondary.
- Wave emoji: CSS `@keyframes wave`; gate with `useReducedMotion()` + `prefers-reduced-motion` fallback.

**Tutorial card**
- `` `glass ${classes.videoCard}` `` with §7.3 `iconBox` + `cardHeader` / `cardDivider`.
- Padding: 22–24px desktop, scales down at 768px / 480px.
- No card drop shadow — depth from glass surface only.

**Responsive video shell**

Fill the card width by default; only shrink on short viewports (pure CSS, no resize listeners):

```css
.videoPlayer {
  width: 100%;
  aspect-ratio: 16 / 9;
}

@media (max-height: 760px) {
  .videoPlayer {
    width: min(100%, calc(min(52vh, 540px) * 16 / 9));
    margin-inline: auto;
  }
}
```

Mobile + short height: `≤480px` and `max-height: 760px` → `min(44vh, 360px)` height cap.

**Removed anti-patterns:** flat opaque card + `box-shadow: 0 8px 32px`, inline iframe styles, dead thumbnail/play-bubble glow CSS.

---

## 8. Charts (Recharts)

### Color assignment

| Series / slice | Color |
|----------------|-------|
| Primary (sales, brand metric) | `--brand-text` |
| Secondary (calls volume) | `--accent-cyan` |
| Sold | `--brand-text` |
| Callback | `--accent-yellow` |
| Answered | `--accent-cyan` |
| No Answer | `--text-tertiary` |
| Not Interested / Missed | `--accent-red` |

### Area chart

- Gradient fills: 40% → 0% opacity on primary, 22% → 0% on secondary.
- Grid: dashed, `--border`, no vertical lines.
- Axes: no axis lines, muted ticks, `--text-secondary` fill.
- Tooltip: glass panel (blurred `--surface-container-highest`, white-mix border).
- Animation: `isAnimationActive={!reduceMotion}`, ~1000ms.

### Donut

- `innerRadius 64%`, `paddingAngle 2`, no stroke.
- Center label: total count + "Total" uppercase sub-label.

---

## 9. Motion

Import from [appMotion.js](../src/motion/appMotion.js) and [useSubtlePageMotion.js](../src/hooks/useSubtlePageMotion.js).

| Preset | Use |
|--------|-----|
| `presets.root` | Page wrapper |
| `presets.child` | Sections, cards |
| `presets.grid` | Grids that stagger children |
| `presets.statsStrip` | Top KPI row |
| `dropdownPanelMotion` | Dropdowns / popovers |

| Constant | Value |
|----------|-------|
| `EASE_SMOOTH` | `[0.22, 1, 0.36, 1]` |
| Enter duration | 0.28s |
| Stagger | 0.055s (sections), 0.05s (grid) |
| Hover lift | `y: -3`, 0.2s |

### Count-up numbers

Use Framer `useMotionValue` + `animate`, 0.9s duration. When `useReducedMotion()` is true, render the final value immediately with no animation.

---

## 10. Responsive breakpoints

Standard breakpoints across dashboard-style pages:

```css
@media (max-width: 1024px) { /* tablet */ }
@media (max-width: 768px)  { /* small tablet */ }
@media (max-width: 480px)  { /* mobile */ }
```

Rules of thumb:
- KPI grid: 4 → 2 columns at 1024px, stays 2 on mobile.
- Performance band: 3-col → 2-col → 1-col.
- Charts row: always stacks to 1 column at 1024px.
- Campaign grid: 3 → 2 → 1.
- Section headers: stack vertically on small tablet.

---

## 11. Accessibility

- Gate all Framer Motion and Recharts animations on `useReducedMotion()`.
- Dropdown triggers: `aria-expanded`, `aria-haspopup="listbox"`, items use `role="option"` + `aria-selected`.
- Maintain visible focus states via `--border-focus` / brand border on interactive elements.
- Do not rely on color alone — pair disposition colors with text labels.

---

## 12. Migrating other pages

When redesigning a page (Call Logs, Billing, Take Calls, etc.):

1. Replace flat `--bg-card` blocks with `` `glass ${classes.yourCard}` `` pattern.
2. Swap hardcoded accent colors for `--brand-text` unless semantically required.
3. Adopt the label/value typography scale for any stat displays.
4. Use `useSubtlePageMotion()` for page enter stagger.
5. Remove heavy `box-shadow` from cards; keep shadows on floating elements only.
6. Use uppercase 12px labels + large numbers for metrics.
7. Add empty states instead of rendering zero-value charts.
8. Test in both `[data-theme="dark"]` (default) and `[data-theme="light"]`.

### Suggested rollout order

1. Call Logs (table + filters — high traffic)
2. Billing (stats + tables)
3. ~~Welcome~~ ✓ — [WelcomePage](../src/pages/WelcomePage.jsx) (cards + embedded video)
4. Profile (cards + forms)
5. Take Calls (complex — migrate section by section)
6. Admin / QA dashboards (reuse dashboard patterns directly)

---

## 13. Anti-patterns (learned from Dashboard v1)

These were tried and rejected — do not reintroduce:

- Colored top bars on KPI cards (rainbow effect).
- Per-card accent colors (cyan KPI, yellow KPI, etc.).
- `composes: glass` in CSS Modules without also applying `.glass` class in JSX (pseudo-elements won't compose).
- `overflow: hidden` on cards that need visible depth (clips shadows and glows).
- Sparklines rendering at zero (creates a harsh brand-colored line at the card bottom).
- `::before` + `filter: blur()` elliptical shadows (produces choppy dark blobs on dark backgrounds).
- Stacked multi-layer `box-shadow` on near-black surfaces (bands instead of blending).
- Icon `box-shadow` glow on every metric card.

---

## 14. File checklist for new pages

```
src/pages/YourPage.jsx          — layout, data, motion
src/pages/YourPage.module.css   — page-specific styles; import glass pattern
src/hooks/useSubtlePageMotion.js — page enter animation (reuse)
src/motion/appMotion.js          — shared motion presets (reuse)
src/styles/variables.css         — tokens (reuse, do not duplicate)
```

Consider extracting `.glass`, trend pills, icon boxes, and section headers into `src/components/ui/` shared modules once a second page adopts them.

**Shared surface primitive:** [surfaces.css](../src/styles/surfaces.css) — import via [global.css](../src/styles/global.css). Apply as `className="glass"` alongside page-specific CSS module classes.
