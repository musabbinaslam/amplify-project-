# AgentCalls — Complete Project Reference

> **Last updated:** April 2, 2026
> **Repo:** `musabbinaslam/amplify-project-` (GitHub)
> **Branch being documented:** `feat-signuplogin-arham`
> **Product name:** AgentCalls / AGENTCALLS

---

## Table of Contents

1. [What Is AgentCalls](#1-what-is-agentcalls)
2. [Business Domain & Problem](#2-business-domain--problem)
3. [Target Users](#3-target-users)
4. [End-to-End Call Flow](#4-end-to-end-call-flow)
5. [Repository Structure](#5-repository-structure)
6. [Tech Stack Summary](#6-tech-stack-summary)
7. [Frontend Deep Dive](#7-frontend-deep-dive)
8. [Backend Deep Dive](#8-backend-deep-dive)
9. [State Management](#9-state-management)
10. [Authentication System](#10-authentication-system)
11. [Twilio Integration](#11-twilio-integration)
12. [Routing Architecture (Macro vs Micro)](#12-routing-architecture-macro-vs-micro)
13. [Design System & Styling](#13-design-system--styling)
14. [Environment Variables](#14-environment-variables)
15. [Running Locally](#15-running-locally)
16. [Git History & Branching](#16-git-history--branching)
17. [Implemented vs Planned](#17-implemented-vs-planned)
18. [Known Integration Gaps](#18-known-integration-gaps)
19. [Target Architecture (North Star)](#19-target-architecture-north-star)
20. [Glossary](#20-glossary)

---

## 1. What Is AgentCalls

AgentCalls is a **browser-based workspace for insurance agents** to receive inbound phone calls from marketing-generated leads. Instead of needing a desk phone or softphone app, agents use Chrome with a headset. Calls arrive via **Twilio Voice (WebRTC)**, while a **Node.js backend** handles token generation, Twilio webhooks, and agent-to-call matching.

**One-line pitch:** AgentCalls connects paid insurance inbound calls to qualified agents in the browser, with campaign-based routing, per-call economics, and a dashboard.

> The repo name `amplify-project-` is historical. The product is **AgentCalls** — it has nothing to do with AWS Amplify.

---

## 2. Business Domain & Problem

**Domain:** Insurance sales — specifically **life insurance** (Final Expense / burial) and **health insurance** (ACA, Medicare Advantage / Supplement).

**The Problem:** Inbound lead vendors and call trackers (Trackdrive, Ringba) handle *macro*-routing — which phone number and which buyer gets a call. But someone still needs to decide *which specific logged-in agent* receives the next call, while respecting:

- **Campaign** — the product line the agent chose to work
- **Licensing** — whether the agent is licensed in the caller's state (planned)
- **Concurrency** — preventing two calls from being assigned to the same agent

AgentCalls is the **micro-routing engine + agent workspace**: register agents as available, lock one agent per call atomically, and present calls with a full UI experience (dashboard, logs, billing, profile).

---

## 3. Target Users

| Audience | Role |
|----------|------|
| **Licensed insurance agents** | Primary users. Go through audio checks, pick a campaign, go live, accept/reject/mute/hang up, follow scripts and buffer rules. |
| **Platform operations** (future) | Configure campaigns, pricing, disputes, compliance — reflected in architecture docs. |
| **End callers (leads)** | Dial in via Twilio + upstream trackers. They never see this UI. |

---

## 4. End-to-End Call Flow

```
1. Lead generation     → Ads drive calls into a Twilio DID (via Trackdrive)
2. Inbound webhook     → Twilio POSTs to backend /api/voice/incoming-call?campaign=X
3. Agent pool          → Agents who clicked "Go Live" are registered in Redis with campaign ID
4. Match & lock        → Backend atomically picks ONE available agent for that campaign (sMove)
5. TwiML response      → Twilio told to <Dial><Client>{agentIdentity}</Client></Dial>
6. Browser rings       → Twilio Voice JS SDK rings the agent; DialerOverlay shows accept/reject
7. Call active         → Timer, mute, hang up controls
8. Post-call (planned) → Log call, deduct credits, update dashboard, disposition
```

---

## 5. Repository Structure

```
amplify-project-/
├── frontend/                  ← React 18 + Vite SPA
│   ├── index.html             ← Vite entry (title: "Vite + React")
│   ├── package.json           ← Frontend deps & scripts
│   ├── vite.config.js         ← Vite + React plugin
│   ├── eslint.config.js       ← ESLint 9 flat config
│   ├── public/
│   │   └── vite.svg
│   └── src/
│       ├── main.jsx           ← React root: QueryClient, GoogleOAuth, Toaster
│       ├── App.jsx            ← Router, lazy routes, guards, ErrorBoundary
│       ├── index.css           ← Imports global.css
│       ├── App.css            ← Vite starter (mostly unused)
│       ├── assets/
│       │   └── react.svg
│       ├── styles/
│       │   ├── global.css     ← Base layout, Inter font, scrollbars, .glass-panel
│       │   └── variables.css  ← CSS custom props: dark theme, accents, radii, layout
│       ├── store/
│       │   ├── authStore.js       ← Zustand: user, token, signup/login/logout
│       │   ├── uiStore.js         ← Zustand: sidebar collapse state
│       │   └── useDialerStore.js  ← Zustand: Twilio device, call state, controls
│       ├── services/
│       │   └── twilioService.js   ← Axios token fetch + Twilio Device init
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.jsx + .module.css
│       │   │   ├── Sidebar.jsx + .module.css
│       │   │   ├── Topbar.jsx + .module.css
│       │   │   └── AnnouncementBanner.jsx + .module.css
│       │   └── ui/
│       │       ├── DialerOverlay.jsx + .module.css
│       │       ├── PageTransition.jsx
│       │       ├── PageLoader.jsx
│       │       └── ErrorFallback.jsx
│       └── pages/
│           ├── SignupPage.jsx + .module.css
│           ├── LoginPage.jsx + .module.css
│           ├── WelcomePage.jsx + .module.css
│           ├── TakeCallsPage.jsx + .module.css
│           ├── DashboardPage.jsx + .module.css
│           ├── CallLogsPage.jsx + .module.css
│           ├── BillingPage.jsx + .module.css
│           ├── LicensedStatesPage.jsx + .module.css
│           └── ProfilePage.jsx + .module.css
│
├── backend/                   ← Node.js + Express + Socket.io + Twilio
│   ├── package.json           ← Backend deps & scripts
│   └── src/
│       ├── server.js          ← ENTRY POINT: Express, CORS, Socket.IO, routes
│       ├── app.js             ← Alternate/older Express setup (NOT used)
│       ├── config/
│       │   ├── twilio.js      ← Twilio env vars + VoiceGrant export
│       │   └── redis.js       ← In-memory Map/Set mock (no real Redis needed)
│       ├── controllers/
│       │   └── voiceController.js  ← Token generation + TwiML incoming handler
│       ├── routes/
│       │   └── voiceRoutes.js      ← Router definition (NOT mounted in server.js)
│       ├── services/
│       │   └── agentManager.js     ← Register/remove/find+lock agents in Redis
│       └── sockets/
│           └── callSockets.js      ← agent:go_live, disconnect, stats
│
├── architecture/              ← Design docs (north star, not all implemented)
│   ├── architecture.md        ← Full system architecture with diagrams
│   └── routing                ← Macro vs micro routing engine design
│
├── CLAUDE.md                  ← WAT framework agent instructions
├── PROJECT_CONTEXT_FOR_CHATGPT.md  ← Detailed AI context document
├── .gitignore                 ← node_modules, .env, dist, .DS_Store, etc.
└── package-lock.json          ← Root lockfile (empty, no root package.json)
```

**No root `package.json`**. Frontend and backend are independent apps with their own `node_modules`.

---

## 6. Tech Stack Summary

### Frontend

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 18.3 |
| Bundler | Vite | 5.4 |
| Language | JavaScript (JSX) | — |
| Routing | react-router-dom | 6.30 |
| State | Zustand | 5.0 |
| Server State | TanStack Query | 5.96 (provider only, no queries yet) |
| Voice/WebRTC | @twilio/voice-sdk | 2.18 |
| HTTP | axios | 1.14 |
| Auth (Google) | @react-oauth/google + jwt-decode | 0.13 / 4.0 |
| Animation | framer-motion | 12.38 |
| Icons | lucide-react | 1.7 |
| Charts | recharts | 3.8 |
| Toasts | react-hot-toast | 2.6 |
| Error Boundary | react-error-boundary | 6.1 |
| Styling | CSS Modules + CSS Custom Properties | — |

### Backend

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js | — |
| Framework | Express | 5.2 |
| Real-time | socket.io | 4.8 |
| Telephony | twilio | 5.13 |
| Auth (future) | bcryptjs + jsonwebtoken | 3.0 / 9.0 |
| Database (future) | pg (PostgreSQL) | 8.20 |
| Cache (future) | redis | 5.11 |
| File Upload (future) | multer | 2.1 |
| Dev | nodemon | 3.1 |

> `pg`, `redis`, `bcryptjs`, `jsonwebtoken`, `multer` are declared in `package.json` but **not wired** into the running application yet. They are ready for future phases.

---

## 7. Frontend Deep Dive

### 7.1 Entry Point (`main.jsx`)

Wraps the app in three providers:
1. **QueryClientProvider** — TanStack Query (no active queries yet)
2. **GoogleOAuthProvider** — Google OAuth with `VITE_GOOGLE_CLIENT_ID`
3. **Toaster** — react-hot-toast at top-right

### 7.2 Routing (`App.jsx`)

Two route groups separated by auth state:

**Guest-only routes** (redirect to `/` if logged in):
- `/signup` → `SignupPage`
- `/login` → `LoginPage`

**Protected routes** (redirect to `/login` if no token):
All nested under `AppShell` (sidebar + topbar + outlet):

| Path | Component | Status |
|------|-----------|--------|
| `/` (index) | WelcomePage | Built |
| `/take-calls` | TakeCallsPage | Built (core feature) |
| `/dashboard` | DashboardPage | Built (static data) |
| `/call-logs` | CallLogsPage | Built (empty state) |
| `/script` | Inline placeholder | Stub |
| `/billing` | BillingPage | Built (static data) |
| `/licensed-states` | LicensedStatesPage | Built (local state only) |
| `/leads` | Inline placeholder | Stub |
| `/profile` | ProfilePage | Built (static data) |
| `/settings` | Inline placeholder | Stub |
| `*` | 404 heading | Catch-all |

**Sidebar also links to** `/ai-training`, `/support`, `/referral-program` — but these have **no matching Route entries**, so they will hit the 404 catch-all.

**Global overlay:** `DialerOverlay` renders outside the route tree, overlaying any page when the dialer is active.

**Page transitions:** All routes are wrapped in `PageTransition` (framer-motion fade + Y slide) with `AnimatePresence mode="wait"`.

**Lazy loading:** Every page is `React.lazy` with `Suspense` fallback to `PageLoader`.

### 7.3 Pages — What Each Does

| Page | Behavior |
|------|----------|
| **SignupPage** | Full onboarding form (full name, email, phone, password, verticals checkboxes). Google OAuth button. Validates via toast. Calls `authStore.signup()`, navigates to `/`. |
| **LoginPage** | Email + password fields. Google OAuth button. Calls `authStore.login()`, navigates to `/`. |
| **WelcomePage** | Static greeting "Welcome, Basit!". Lucide Play icon + placeholder image for tutorial video. |
| **TakeCallsPage** | **3-step wizard:** Step 1 = mic level (Web Audio API) + speaker test + device pickers. Step 2 = category (Life/Health) → campaign cards (Final Expense, ACA, Medicare with prices/buffers). Step 3 = rules review + "I Agree, Go Live" → calls `initializeTwilioDevice(mockAgentId, campaign)`. When live, shows "Dialer Active" with pause/offline button. |
| **DashboardPage** | Recharts line chart with zeroed weekly data. Stat cards (calls, close rate, earnings). Campaign pricing cards. Licensed states + recent calls placeholders. Uses framer-motion. |
| **CallLogsPage** | Search input, date filter button, empty state "No calls yet". |
| **BillingPage** | Balance $0.00, low balance warning, empty transactions. Silver/Gold plan cards (static). |
| **LicensedStatesPage** | All 50 US state abbreviations as checkboxes. Select All / Clear All. Local state only — Save button has no persistence. |
| **ProfilePage** | Static display: name "Basit", email, landing URL slug, bio textarea. Character count not wired to live input length. |

### 7.4 Layout Components

| Component | What It Does |
|-----------|-------------|
| **AppShell** | Main authenticated layout: AnnouncementBanner on top, Sidebar on left, Topbar, and `<Outlet>` for page content. Reads `useUIStore` for sidebar collapse class. |
| **Sidebar** | Left navigation with NavLink items, badges (Beta, Coming Soon), collapse toggle. Logout button calls `authStore.logout()`. |
| **Topbar** | Derives page title from current URL path. Shows subtitle "Basit", wallet balance "0.00", "No Credits", globe/moon icons (non-functional), "Offline" status badge. |
| **AnnouncementBanner** | Top strip with Discord promo. Close button is presentational (no state toggle). |

### 7.5 UI Components

| Component | What It Does |
|-----------|-------------|
| **DialerOverlay** | Subscribes to `useDialerStore`. Hidden when offline/error. Shows "Listening" bar when idle. Shows glass card with caller ID, campaign, accept/reject when ringing. Shows timer + mute/hangup when active. Plays `/ringtone.mp3` in loop when ringing. |
| **PageTransition** | Framer-motion wrapper: fade + slight Y motion on enter/exit. |
| **PageLoader** | Centered spinner with "Loading page..." text and inline keyframe animation. |
| **ErrorFallback** | Red-tinted error panel with `<pre>` message and "Try again" button. |

---

## 8. Backend Deep Dive

### 8.1 Entry Point (`server.js`)

The **only** entry point used by `npm start` / `npm run dev`.

Boot sequence:
1. Configure CORS (all origins for dev)
2. Parse JSON + URL-encoded bodies (Twilio webhooks use form-encoded)
3. Create Socket.IO server with CORS for `http://localhost:5173`
4. Connect to Redis (in-memory mock)
5. Initialize Socket.IO event handlers
6. Mount routes:
   - `POST /api/voice/token` → generate Twilio access token
   - `POST /api/voice/incoming-call` → handle Twilio webhook with TwiML
   - `GET /health` → `{ status: 'Engine Active' }`
7. Listen on port 3001 (or `PORT` env)

### 8.2 Voice Controller (`voiceController.js`)

**`generateToken(req, res)`**
- Requires `identity` in request body
- Creates Twilio `AccessToken` with `VoiceGrant` (outgoing via TwiML App SID, incoming allowed)
- Returns `{ token: <JWT>, identity }`

**`handleIncomingCall(req, res)`**
- Reads `FromState` from Twilio POST body
- Reads `campaign` from **query parameter** (e.g. `?campaign=final_expense`)
- Calls `agentManager.findAndLockAvailableAgent(campaign)`
- If agent found: TwiML says "Connecting..." and dials `<Client>{agentId}</Client>`
- If no agent: TwiML says "All agents busy, try again later"
- Responds with `text/xml`

### 8.3 Agent Manager (`agentManager.js`)

The core routing engine using Redis (mocked):

**`registerAgent(socketId, payload)`**
- Stores hash `agent:{socketId}` with campaignId, status=AVAILABLE, joinedAt
- Adds socketId to `agents:available` set

**`removeAgent(socketId)`**
- Deletes hash and removes from all sets (available, ringing, busy)

**`findAndLockAvailableAgent(campaignId)`**
- Gets all members of `agents:available`
- Linear scan for matching campaignId
- **Atomic lock:** `sMove` from `agents:available` → `agents:ringing`
- If sMove returns 1, the lock was acquired — returns the agent
- If sMove returns 0 (another call grabbed them), continues scanning
- Returns `null` if no agent found

### 8.4 Socket Layer (`callSockets.js`)

- `agent:go_live` → registers agent, emits `agent:live_confirmed`, broadcasts `stats:agent_count`
- `disconnect` → removes agent, updates count

**The frontend does NOT emit `agent:go_live` yet** — there is no `socket.io-client` usage in the React app.

### 8.5 Redis Mock (`redis.js`)

In-memory implementation using JavaScript `Map` (for hashes) and `Set` (for sets). Supports: `hSet`, `hGetAll`, `sAdd`, `sRem`, `sMembers`, `sMove`, `sCard`, `del`. No real Redis server needed for local dev.

### 8.6 Unused Files

- **`app.js`** — An alternate Express + Socket.IO setup. NOT referenced by package.json scripts. Ignore unless refactored.
- **`voiceRoutes.js`** — Defines a router with `/incoming` instead of `/incoming-call`. NOT mounted in server.js.

---

## 9. State Management

All global state uses **Zustand** (no Redux, no React Context for app state):

### `authStore.js`
| Field | Type | Purpose |
|-------|------|---------|
| `user` | Object/null | Current user profile |
| `token` | String/null | Auth token (mock or Google credential) |
| **Actions** | | |
| `signup(formData)` | → | Creates mock user + mock token, persists to localStorage |
| `login(email, pw)` | → | Creates mock user from email, persists (no server call) |
| `googleLogin(credential)` | → | Decodes Google JWT, stores user + credential |
| `logout()` | → | Clears localStorage + state |

Persisted to `localStorage` key: `agentcalls_auth`

### `useDialerStore.js`
| Field | Type | Purpose |
|-------|------|---------|
| `device` | Twilio Device/null | Active Twilio Device instance |
| `callState` | String | `offline` / `idle` / `ringing` / `active` / `error` |
| `activeCall` | Object/null | Current Twilio Call object |
| `agentIdentity` | String/null | Agent's Twilio client identity |
| `activeCampaign` | String/null | Selected campaign ID |
| `isMuted` | Boolean | Mute state |
| `callDuration` | Number | Seconds elapsed on active call |
| `incomingCallerId` | String/null | Caller's phone number |
| **Actions** | | |
| `acceptCall()` | → | Calls `activeCall.accept()`, sets state to active |
| `rejectCall()` | → | Calls `activeCall.reject()`, resets state |
| `hangUp()` | → | Disconnects call + device, resets state |
| `toggleMute()` | → | Toggles mute on active call |

### `uiStore.js`
| Field | Purpose |
|-------|---------|
| `isSidebarCollapsed` | Whether sidebar is collapsed |
| `toggleSidebar()` | Toggle collapse state |

---

## 10. Authentication System

**Current state: Client-side mock + Google OAuth (no backend auth API)**

### Email/Password Signup
- Builds a fake user object with `id: agent_${Date.now()}`
- Token is `mock_token_${Date.now()}`
- No server call. No password hashing. No validation beyond empty fields.

### Email/Password Login
- Creates user from email local-part as name
- Same mock token pattern
- Password is **not verified** against anything

### Google OAuth
- Uses `@react-oauth/google` with `VITE_GOOGLE_CLIENT_ID`
- Decodes Google's credential JWT with `jwt-decode`
- Stores Google `sub`, `name`, `email`, `picture`
- Uses the raw credential string as the auth token

### Route Protection
- `ProtectedRoute`: checks for any truthy `token` in Zustand → if missing, redirects to `/login`
- `GuestRoute`: if token exists, redirects to `/`
- No token expiry checks, no refresh flow

### What's Planned (from architecture)
- JWT access tokens (15 min) + httpOnly refresh cookies (7 days)
- `POST /auth/login`, `/register`, `/refresh`, `/logout`
- bcrypt password hashing, role-based middleware (agent/admin)
- None of this is built yet

---

## 11. Twilio Integration

### How It Works Today

1. **Agent clicks "Go Live"** on TakeCallsPage
2. Frontend calls `initializeTwilioDevice(mockAgentId, campaign)` in `twilioService.js`
3. Service POSTs to `backend /api/voice/token` with `{ identity: mockAgentId, campaign }`
4. Backend creates Twilio AccessToken JWT with VoiceGrant (incoming allowed)
5. Frontend creates `new Device(token)` and calls `device.register()`
6. Device is now registered — `callState` becomes `idle`
7. When Twilio routes a call to this identity, the SDK fires the `incoming` event
8. `DialerOverlay` shows ringing UI with accept/reject

### Agent Identity

`mockAgentId` is `agent_${Math.random().toString(36).substr(2, 9)}` — a random string generated in `TakeCallsPage`. This identity must match what the backend uses in `<Client>` TwiML, which is currently the `socketId` from the agent manager (a gap — see Section 18).

### Required Twilio Resources
- **Twilio Account** with Account SID + Auth Token
- **API Key** with SID + Secret (for JWT signing)
- **TwiML App** with Voice URL pointing to `POST https://<host>/api/voice/incoming-call?campaign=<id>`
- **Phone Number** connected to the TwiML App (or upstream tracker like Trackdrive)

---

## 12. Routing Architecture (Macro vs Micro)

### Macro Routing (Trackdrive / Ringba)
External call trackers decide which number and which buyer gets the call. They don't know about individual agents.

### Micro Routing (This Platform)
Our Node + Redis layer decides which specific agent answers:

1. Agent goes live → WebSocket → Redis set `agents:available` with campaign + (future) licensed states
2. Twilio webhook arrives with campaign + caller state
3. Backend scans Redis for matching available agent
4. **Atomic lock** via `sMove` prevents two simultaneous calls from grabbing the same agent
5. TwiML routes call to locked agent's browser

### Current State
- Campaign matching: **implemented**
- Atomic locking: **implemented** (sMove)
- Licensed state filtering: **not implemented** (architecture only)
- Frontend Socket.IO registration: **not implemented** (no socket.io-client)

---

## 13. Design System & Styling

### Approach
- **CSS Modules** for component-scoped styles (every page + most components have `*.module.css`)
- **CSS Custom Properties** for theming (defined in `variables.css`)
- **No Tailwind**, no styled-components, no CSS-in-JS

### Theme (Dark Mode)
The entire UI is dark-themed by default:

| Variable | Value | Purpose |
|----------|-------|---------|
| `--surface` | `#0e0e0e` | Base background |
| `--surface-container` | `#1a1a1a` | Card/panel background |
| `--accent-green` | `#25f425` | Primary accent (CTA, success) |
| `--accent-cyan` | `#00e3fd` | Secondary accent |
| `--accent-red` | `#ff7351` | Error/destructive |
| `--accent-yellow` | `#ffcf33` | Warning |
| `--text-primary` | `#ffffff` | Main text |
| `--text-secondary` | `#adaaaa` | Muted text |
| `--border` | `rgba(255,255,255,0.05)` | Ghost borders |

### Layout Variables
- `--sidebar-width`: 260px (72px collapsed)
- `--topbar-height`: 72px
- `--banner-height`: 48px

### Font
Inter (loaded in `global.css`)

---

## 14. Environment Variables

### Frontend (Vite — must be prefixed `VITE_`)

| Variable | Used In | Default |
|----------|---------|---------|
| `VITE_GOOGLE_CLIENT_ID` | `main.jsx` | `''` (empty string) |
| `VITE_API_URL` | `twilioService.js` | `'http://localhost:3001'` |

### Backend

| Variable | Used In | Default | Required |
|----------|---------|---------|----------|
| `PORT` | `server.js` | `3001` | No |
| `TWILIO_ACCOUNT_SID` | `config/twilio.js` | — | Yes |
| `TWILIO_AUTH_TOKEN` | `config/twilio.js` | — | Yes |
| `TWILIO_API_KEY_SID` | `config/twilio.js` | — | Yes |
| `TWILIO_API_KEY_SECRET` | `config/twilio.js` | — | Yes |
| `TWILIO_TWIML_APP_SID` | `config/twilio.js` | — | Yes |
| `CLIENT_URL` | `app.js` (unused) | `'*'` | No |

> There is **no `.env.example`** in the repo. Create a `.env` in `backend/` with the Twilio credentials. Never commit secrets.

---

## 15. Running Locally

### Prerequisites
- Node.js (LTS)
- A Twilio account with API Key, TwiML App, and phone number configured
- Google OAuth Client ID (for Google sign-in to work)

### Backend
```bash
cd backend
npm install
# Create .env with Twilio credentials (see Section 14)
npm run dev        # nodemon on port 3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite on port 5173
```

### For Real Twilio Calls
Twilio needs a public URL for webhooks. Use **ngrok** or similar:
```bash
ngrok http 3001
```
Then set your TwiML App's Voice URL to:
`https://<ngrok-id>.ngrok.io/api/voice/incoming-call?campaign=final_expense`

### Available Scripts

**Frontend:**
| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Dev server on 5173 |
| `build` | `vite build` | Production build to `dist/` |
| `lint` | `eslint .` | Run ESLint |
| `preview` | `vite preview` | Preview production build |

**Backend:**
| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `node src/server.js` | Production start |
| `dev` | `nodemon src/server.js` | Dev with auto-reload |

---

## 16. Git History & Branching

### Branches

| Branch | Purpose |
|--------|---------|
| `main` | Main branch |
| `feat-signuplogin-arham` | Current: signup/login feature (Arham) |
| `dashboard-ui-rayyan` | Dashboard UI work (Rayyan) |
| `TEST` | Remote test branch |

### Commit History (oldest → newest)

```
8ce95a0  Initial commit with fully integrated dialer
5a6d135  Added CLAUDE.md
b0f835f  Merge PR #1: feat-dashboard-rayyan
152a63f  Designed login and signup
9dabf97  Implement modular CSS styling + global design variables
2d00721  Added OAuth
d460e03  Merge PR #3: dashboard-ui-rayyan
```

### Team
- **Musabbina Aslam** — repo owner
- **Arham** — signup/login feature branch
- **Rayyan** — dashboard UI

---

## 17. Implemented vs Planned

### What's Built and Working

| Feature | Status | Notes |
|---------|--------|-------|
| React SPA with all routes + layout | **Done** | Lazy-loaded, animated transitions |
| Signup/Login pages | **Done** | Mock auth (no backend API) |
| Google OAuth (frontend) | **Done** | Decodes Google JWT, stores credential |
| Take Calls wizard (3 steps) | **Done** | Mic test, campaign select, rules + go live |
| Twilio Device registration | **Done** | Gets token from backend, registers with SDK |
| Dialer overlay (ring/active/idle) | **Done** | Accept, reject, mute, hang up, timer |
| Backend token endpoint | **Done** | Twilio AccessToken with VoiceGrant |
| Backend TwiML handler | **Done** | Finds agent, dials Client, or "no agents" |
| Agent manager (Redis mock) | **Done** | Register, remove, find + atomic lock |
| Socket.IO server handlers | **Done** | go_live, disconnect, agent count |
| Dashboard UI | **Done** | Static/zero data, Recharts chart |
| Billing page UI | **Done** | Static plans, empty transactions |
| Licensed States UI | **Done** | 50-state checkboxes, local state only |
| Profile page UI | **Done** | Static display |
| Call Logs page UI | **Done** | Empty state with search |
| CSS design system | **Done** | Dark theme, variables, modules |

### What's NOT Built Yet (From Architecture)

| Feature | Status | Architecture Location |
|---------|--------|----------------------|
| Backend JWT auth (login/register/refresh) | Not started | architecture.md §3, §Security |
| PostgreSQL database + schema | Not started | architecture.md §5 |
| Real Redis (vs mock) | Not started | architecture.md §6 |
| Socket.IO client in frontend | Not started | architecture.md §4 |
| Agent pool registration via WebSocket | Not started | routing doc |
| Licensed-state filtering in routing | Not started | routing doc |
| Stripe billing integration | Not started | architecture.md §8 |
| Call logging + persistence | Not started | architecture.md §5 |
| Credit deduction per call | Not started | architecture.md |
| Dispute system | Not started | architecture.md §5 |
| Campaign management API | Not started | architecture.md §3 |
| Leads management | Not started | architecture.md §3 |
| Script management | Not started | architecture.md §3 |
| Referral system | Not started | architecture.md §3 |
| AI Training | Not started | Sidebar (Coming Soon) |
| Email notifications (SendGrid) | Not started | architecture.md |
| File storage (AWS S3) | Not started | architecture.md §9 |
| Nginx reverse proxy | Not started | architecture.md §2 |
| Admin role / middleware | Not started | architecture.md §Security |

---

## 18. Known Integration Gaps

These are critical issues to resolve for end-to-end call flow:

### 1. Twilio Client Identity Mismatch
- **Frontend** generates `mockAgentId = agent_${random}` and uses it as the Twilio Device identity
- **Backend** uses the `socketId` (from Socket.IO) when TwiML dials `<Client>{agent.id}</Client>`
- These are **different strings** — the call will NOT ring the correct browser
- **Fix:** Unify the identity. Use the same string for Twilio token, Socket.IO registration, and TwiML Client dial.

### 2. No Frontend Socket.IO Client
- Backend has `agent:go_live` socket handler that registers agents in Redis
- Frontend does NOT import or use `socket.io-client`
- Agents are never registered in the pool, so `findAndLockAvailableAgent` finds nobody
- **Fix:** Add `socket.io-client` to frontend, emit `agent:go_live` after Twilio Device registers.

### 3. Campaign Query Parameter on Webhook
- Backend reads `campaign` from `req.query.campaign`
- Twilio must be configured to pass this as a query parameter in the webhook URL
- e.g. `https://host/api/voice/incoming-call?campaign=final_expense`

### 4. Duplicate/Unused Server Files
- `app.js` and `voiceRoutes.js` are not used — `server.js` is the source of truth
- Could cause confusion during development

### 5. Auth is Entirely Mock
- Any string in localStorage grants access to all routes
- No server-side validation, no token expiry, no refresh
- Must be replaced with real JWT auth before production

---

## 19. Target Architecture (North Star)

From `architecture/architecture.md`:

```
┌──────────────────────────────────────────────────┐
│  CLIENT: React + Vite + Zustand + TanStack Query │
│  + Twilio Voice JS SDK (WebRTC)                  │
└───────────────────┬──────────────────────────────┘
                    │ HTTPS / WSS
┌───────────────────▼──────────────────────────────┐
│  API GATEWAY: Nginx (SSL + Rate Limiting)        │
└───────┬───────────────────────────┬──────────────┘
        │ REST                      │ WebSocket
┌───────▼──────────┐      ┌────────▼──────────────┐
│  Express API     │      │  Socket.IO Server     │
│  Auth, Users,    │      │  Go Live, Call Events, │
│  Calls, Billing, │      │  Stats, Notifications  │
│  Campaigns, etc. │      └────────────────────────┘
└────┬─────┬───────┘
     │     │
┌────▼─┐ ┌─▼────┐ ┌─────────┐
│Postgres│ │Redis │ │ AWS S3  │
└────────┘ └──────┘ └─────────┘
     │
┌────▼─────────────────────────────┐
│  EXTERNAL: Twilio, Stripe,       │
│  SendGrid                        │
└──────────────────────────────────┘
```

### Target DB Schema (PostgreSQL)
`users`, `campaigns`, `call_logs`, `transactions`, `licensed_states`, `disputes`, `subscriptions`, `user_subscriptions`, `leads`, `scripts`

### Target Redis Uses
- Twilio capability tokens (TTL 3600s)
- Agent online status (TTL 30s with heartbeat)
- Rate limit counters (TTL 60s)
- Dashboard stat cache (TTL 300s)

### Target Deployment
- AWS Route 53 → CloudFront CDN → S3 (React build)
- EC2/ECS with Nginx → Express API + Socket.IO containers
- RDS PostgreSQL, ElastiCache Redis, S3 for media

---

## 20. Glossary

| Term | Meaning |
|------|---------|
| **AgentCalls** | Product name. Browser workspace for insurance agents to receive calls. |
| **amplify-project-** | GitHub repo name (historical). Not related to AWS Amplify. |
| **Campaign** | Product line (Final Expense, ACA, Medicare) used for routing and pricing. |
| **Buffer time** | Initial seconds where agent must follow strict rules (no quoting, no personal numbers). Tied to pay-per-call billing. |
| **Go Live** | Agent action to become available for calls (Twilio Device + intended Socket registration). |
| **Macro routing** | Upstream systems (Trackdrive/Ringba) deciding which number/buyer gets the call. |
| **Micro routing** | This platform's job: pick which specific agent gets the call, with locking. |
| **TwiML** | Twilio Markup Language — XML instructions for call handling (say, dial, etc.). |
| **VoiceGrant** | JWT grant allowing browser SDK to use Twilio Voice. |
| **sMove** | Redis atomic set-move operation used for agent locking (prevents race conditions). |
| **Pre-screening** | Optional vendor step before agent connection. Mentioned in campaign disclaimers. |
| **Agent Manager** | Backend service (`agentManager.js`) that manages the Redis-backed agent pool. |
| **DialerOverlay** | Global React component showing call controls (ring, accept, mute, hangup). |

---

*This document was auto-generated from a full codebase audit on April 2, 2026. Update it whenever major features land (auth, database, real Redis, Socket.IO client, billing).*
