# CallsFlow UI Design System

Design reference extracted from the redesigned Dashboard. Use this document when updating any authenticated `/app` screen so the product feels cohesive.

**Reference implementation:** [DashboardPage.jsx](../src/pages/DashboardPage.jsx) + [DashboardPage.module.css](../src/pages/DashboardPage.module.css)

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

The shared card treatment used on Dashboard. Apply **two CSS module classes** in JSX — never rely on CSS Modules `composes` for pseudo-elements or `:hover`.

```jsx
<div className={`${classes.glass} ${classes.kpiCard}`} />
```

### Base card

```css
.glass {
  position: relative;
  background: var(--surface-container-low);
  border: 1px solid color-mix(in srgb, #ffffff 7%, transparent);
  border-radius: var(--radius-xl);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 0.22s ease, background 0.22s ease;
}

.glass:hover {
  background: var(--surface-container);
  border-color: color-mix(in srgb, #ffffff 11%, transparent);
}
```

### Depth rules — do and don't

| Do | Don't |
|----|-------|
| Inset top highlight (`inset 0 1px 0 rgba(255,255,255,0.05)`) | Stacked `box-shadow` layers on dark cards |
| Surface tier shift on hover | `::before` + `filter: blur()` fake shadows |
| Hairline white-mix border | Heavy outer glow on every icon |
| Ambient page wash at 20–25% opacity | Per-card colored top accent bars |
| Shadow on floating overlays only (dropdowns, tooltips) | Rainbow accent per card |

Floating overlays (menus, tooltips) may use a single soft shadow because they sit above the page:

```css
box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
```

---

## 6. Ambient page background

One subtle wash behind the whole page — not per card.

```css
.pageRoot::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(100% 40% at 50% 0%, var(--brand-dim), transparent 70%);
  opacity: 0.25;
}

.pageRoot > * {
  position: relative;
  z-index: 1;
}
```

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

1. Replace flat `--bg-card` blocks with `${classes.glass} ${classes.yourCard}` pattern.
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
3. Welcome / Profile (cards + forms)
4. Take Calls (complex — migrate section by section)
5. Admin / QA dashboards (reuse dashboard patterns directly)

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
