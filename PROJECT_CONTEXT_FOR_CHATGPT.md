# Amplify / AgentCalls — Project Context for AI Assistants

This document summarizes the **musabbinaslam/amplify-project-** repository so tools like ChatGPT can reason about **intent**, **what is implemented**, and **what is still design-only**. It is derived from the repo’s `architecture/` docs and from the actual `frontend/` and `backend/` code.

**Source repo:** [https://github.com/musabbinaslam/amplify-project-](https://github.com/musabbinaslam/amplify-project-)

---

## 1. What this project is about (detailed)

### 1.1 Executive summary

**AgentCalls** (branded in the UI as **AGENTCALLS**) is a **web application for insurance agents** who want to **receive inbound phone calls** from marketing-generated leads—without a traditional desk phone or softphone app tied to a single location. Agents use a **browser** (Chrome-style) with a **headset**, powered by **Twilio Voice** (WebRTC), while a **Node.js backend** issues secure tokens, handles **Twilio webhooks**, and (in the full design) **matches** each inbound call to an **available agent** by **campaign** and, eventually, **licensed state** and other rules.

The repo name on GitHub is **amplify-project-**; the product narrative in the code and architecture docs centers on **AgentCalls** as an **insurance call distribution / dialer interface**, not AWS Amplify hosting (despite the folder name).

### 1.2 Business domain & problem it addresses

**Domain:** **Insurance sales**, especially **life** (e.g. Final Expense / burial) and **health** (ACA, Medicare Advantage / Supplement). Callers typically originate from **paid advertising**; the platform copy references **pre-screening lines** and **high-intent** traffic so agents spend time on people who already raised their hand.

**Problem:** Inbound lead vendors and **trackers** (e.g. Trackdrive, Ringba—mentioned in `architecture/routing`) route calls at a **macro** level (which number, which buyer). Someone still has to decide **which logged-in agent** receives the next call, respecting:

- **Campaign** (product line the agent chose to work)
- **Licensing** (agent licensed in the caller’s state—planned in architecture)
- **Concurrency** (no two calls accidentally assigned to one agent)

This project is the **micro-routing engine + agent workspace**: register agents as “available,” lock one agent per call atomically, and present calls in the browser with a **dashboard**, **logs**, **billing**, and **profile** experience.

### 1.3 Who the product is for

| Audience | Role in the story |
|----------|-------------------|
| **Licensed insurance agents** | Primary users: go through audio checks, pick a **campaign**, go **live**, accept/reject/mute/hang up, follow scripts and buffer rules. |
| **Platform / operations** (future) | Configure campaigns, pricing, dispute flows, compliance—reflected in architecture (admin, webhooks). |
| **End callers (leads)** | Dial in via Twilio (and upstream trackers); they never use this UI—they only experience hold/ring and conversation. |

The **Welcome** page copy positions the product around **taking calls**, **earning commissions**, and **maximizing success** via a tutorial video (placeholder UI).

### 1.4 End-to-end call story (intended)

1. **Lead generation:** Ads drive calls into a **telephony path** (e.g. Trackdrive → Twilio DID).
2. **Inbound webhook:** Twilio sends an HTTP request to the backend **incoming-call** URL with caller metadata (e.g. state in `FromState`).
3. **Agent pool:** Agents who clicked **Go Live** are registered (Socket.io + Redis in the design; prototype uses an in-memory store) with a **campaign id** (and in the full vision, licensed states).
4. **Match & lock:** Backend picks **one** available agent for that campaign, using an **atomic** move so two simultaneous inbound calls cannot grab the same agent incorrectly.
5. **TwiML:** Twilio is instructed to **dial** that agent’s **Twilio Client** identity in the browser.
6. **Browser:** The Twilio JS SDK **rings** the agent; overlay UI for accept/reject; active call with timer, mute, hang up.
7. **Post-call (planned):** Log call, disposition, **billing** (per-call price, buffer rules), disputes, analytics on **Dashboard** and **Call Logs**.

### 1.5 Campaigns & pricing (as shown in the UI)

On **Take Calls → Step 2**, agents choose:

- **Category:** **Life insurance** or **Health insurance**.
- **Campaigns** (examples hard-coded in the UI):

| Campaign id (code) | Label | Category | Shown price | Buffer (UI) |
|--------------------|-------|----------|-------------|-------------|
| `final_expense` | Final Expense | Life | $60/call | 90s buffer |
| `aca` | ACA | Health | $50/call | 90s buffer |
| `medicare` | Medicare | Health | $35/call | 25s buffer |

Copy also states that **some calls may be pre-screened** and that callers come from **paid advertising** and requested information—setting expectations for agents.

### 1.6 Agent rules & compliance (UI copy on “Review Call Rules”)

Before **Go Live**, agents must acknowledge rules such as:

- Follow the **script** to qualify the prospect.
- **Do not quote** prices or plans inside the **campaign buffer** window (the UI emphasizes **90 seconds** for the rules step, while Medicare shows a **25s** buffer in the campaign card—implementation should align these per campaign).
- **Do not** ask for callback numbers or give personal numbers inside the buffer window.
- After the buffer period, the agent may **take control** of the conversation.

These rules mirror **pay-per-call** programs where the first minute is “vendor buffer” time.

### 1.7 Product surface area (navigation & pages)

The **sidebar** (`Sidebar.jsx`) defines the intended product map:

| Area | Purpose |
|------|---------|
| **Welcome** | Onboarding; tutorial video placeholder (“How to Use AgentCalls”). |
| **Take Calls** | Wizard: mic/speaker test → category & campaign → rules → **Go Live** (Twilio Device). |
| **Dashboard** | Performance snapshot: calls, close rate, earnings, charts (currently **placeholder zeros**). |
| **Call Logs** | History of calls (UI present; backend persistence not wired in prototype). |
| **Script** | Campaign script (placeholder page). |
| **Billing** | Credits / subscriptions / payments (architecture: Stripe; **no live API** in snippet). |
| **Licensed States** | Where the agent is licensed—feeds **routing** in the full design. |
| **Leads** | Beta placeholder. |
| **Profile** | Agent profile. |
| **AI Training** | Sidebar entry **Coming Soon** (disabled). |
| **Support** | Nav item (route not fully wired in `App.jsx`—may 404 unless added). |
| **Referral Program** | Nav item (same caveat). |
| **Settings** | Placeholder. |
| **Logout** | Button in sidebar (no auth implementation in reviewed code). |

**Global:** **`DialerOverlay`** shows **idle** (“listening”), **ringing**, and **active** call controls on top of any page once the agent is live.

### 1.8 Technical approach (how the pieces fit)

- **Frontend:** Single-page app (**React + Vite**), **client-side routing**, **Zustand** for dialer state, **TanStack Query** ready for API data, **Twilio Voice SDK** for real audio.
- **Backend:** **Express** HTTP server **and** **Socket.io** on the same port; **Twilio** JWT for the browser; **TwiML** for inbound call handling; **Redis-like** agent registry (mocked in-repo).
- **Future layers (architecture doc):** **PostgreSQL** for users, calls, money; **real Redis**; **Stripe**; **JWT auth**; **Nginx**; **S3**; email—documented as target state, not all implemented. For a line-by-line **implemented vs planned** checklist, see **§3**.

### 1.9 “Amplify” vs “AgentCalls” naming

- **Repository:** `amplify-project-` (historical or working name).
- **User-facing brand in code:** **AGENTCALLS** / AgentCalls.
- When discussing the project externally, **AgentCalls** matches the product; **amplify-project** is the **GitHub repo folder name** only.

### 1.10 One-line pitch (for ChatGPT / docs)

**AgentCalls connects paid insurance inbound calls to qualified agents in the browser**, with campaign-based routing, per-call economics, and a dashboard—**Twilio** for telephony, **Node** for orchestration, **React** for the agent workspace.

---

## 2. Repository layout (high level)

| Path | Role |
|------|------|
| `frontend/` | React 18 + Vite SPA: UI, Twilio Voice SDK, Zustand, TanStack Query |
| `backend/` | Node.js + Express + Socket.io + Twilio JWT + in-memory Redis mock |
| `architecture/` | **Target** system design (full stack vision, not all implemented in code) |
| `pictures/` | Screenshots / reference images |

There is **no** root `README.md` or `.env.example` in the clone; `.gitignore` excludes `node_modules/`, `.env`, `dist/`, etc.

---

## 3. Intended vs. implemented (critical for ChatGPT)

### 3.1 Intended (documented in `architecture/architecture.md`)

The architecture doc describes a **production-grade** system:

- **Frontend:** React + Vite, Zustand, TanStack Query, Twilio Voice JS, WebSocket client.
- **API gateway:** Nginx (SSL, rate limits, `/api` → REST, `/ws` → WS).
- **Backend:** Express REST + **separate** Socket.io concerns (in the diagram), auth (JWT + refresh cookies), many domains: users, calls, billing, campaigns, leads, webhooks, etc.
- **Data:** PostgreSQL schema (users, campaigns, call_logs, billing, licensed states, leads, …), **real Redis** for tokens, agent presence, rate limits.
- **External:** Twilio Voice, Stripe, SendGrid, AWS S3.

### 3.2 What the codebase actually contains today

| Area | Status |
|------|--------|
| React SPA with routes, layout, campaign wizard, dialer overlay | **Implemented** |
| Twilio **access token** endpoint + TwiML **incoming call** handler | **Implemented** |
| Socket.io server + `agent:go_live` / disconnect + `stats:agent_count` | **Implemented on server** |
| `agentManager` (Redis-like sets + hashes, find/lock agent) | **Implemented** |
| Redis | **In-memory mock** in `backend/src/config/redis.js` (no Redis required locally) |
| PostgreSQL / Prisma / auth / Stripe / billing APIs | **Not present** in backend as wired app |
| Socket.io **client** in the frontend | **Not present** (no `socket.io-client` usage) |
| `backend/src/app.js` | **Alternate/older** Express setup; **entry point is `server.js`** |

When helping with this repo, **treat `architecture/` as the north star** and **the `src/` trees as the current prototype**.

---

## 4. Backend (`backend/`)

### 4.1 Stack

- **Runtime:** Node.js  
- **Framework:** Express 5  
- **Real-time:** `socket.io`  
- **Telephony:** `twilio` (REST client + JWT `AccessToken` + `VoiceGrant` + TwiML `VoiceResponse`)  
- **Persistence:** `pg` is listed in `package.json` but **no DB layer is wired** in the shown files  
- **Redis:** Package `redis` in `package.json`; **actual code uses a mock** `Map`-backed client

### 4.2 Entry point

- **`npm start` / `npm run dev`** → `node src/server.js` (with nodemon for dev)

`server.js`:

- Enables **CORS** (`cors()` for all origins — dev-friendly).
- Parses **JSON** and **urlencoded** bodies (Twilio webhooks often use form-encoded).
- Creates **Socket.io** on the same HTTP server, CORS origin `http://localhost:5173`.
- Calls `connectRedis()` then `setupCallSockets(io)`.
- Mounts:
  - `POST /api/voice/token` → `voiceController.generateToken`
  - `POST /api/voice/incoming-call` → `voiceController.handleIncomingCall`
  - `GET /health` → `{ status: 'Engine Active' }`
- Default port **3001** (`process.env.PORT`).

### 4.3 Voice controller (`src/controllers/voiceController.js`)

**`generateToken`**

- Body: `{ identity }` (required).
- Builds Twilio **Access Token** with:
  - `VoiceGrant` using `outgoingApplicationSid` = `TWILIO_TWIML_APP_SID`
  - `incomingAllow: true` (needed for browser to receive inbound calls)
- Returns `{ token, identity }`.

**`handleIncomingCall`**

- Builds TwiML with `VoiceResponse`.
- Reads `callerState` from `req.body.FromState` (Twilio).
- Reads `campaign` from **`req.query.campaign`** (not body).
- Calls `agentManager.findAndLockAvailableAgent(campaign)`.
- If an agent is found: `say` + `dial().client(assignedAgent.id)`.
- Else: plays a “no agents” message.
- Responds with `text/xml` TwiML.

**Integration note:** Twilio `<Client>` identity must match the **same string** used when generating the JWT `identity`. The backend currently uses `assignedAgent.id` from Redis (`socketId` from `registerAgent`). The frontend generates a **random** `mockAgentId` for Twilio. **Those must align for routing to ring the correct browser** — see §7.

### 4.4 Agent manager (`src/services/agentManager.js`)

- **`registerAgent(socketId, payload)`**  
  - Stores hash `agent:{socketId}` with `campaignId`, `status`, `joinedAt`.  
  - Adds `socketId` to set `agents:available`.

- **`removeAgent(socketId)`**  
  - Deletes hash + removes from `agents:available`, `agents:ringing`, `agents:busy`.

- **`findAndLockAvailableAgent(campaignId)`**  
  - Lists `agents:available`.  
  - Scans for matching `campaignId`.  
  - Uses **`sMove`** from `agents:available` → `agents:ringing` as a **lock**.  
  - Returns `{ id: socketId, ...agentData }` or `null`.

**Limitation:** `findAndLockAvailableAgent` does **not** yet filter by **licensed state** (the architecture and `routing` doc describe that).

### 4.5 Socket layer (`src/sockets/callSockets.js`)

- On **`agent:go_live`**: `registerAgent(socket.id, payload)`, emit `agent:live_confirmed`, broadcast `stats:agent_count` via `redisClient.sCard('agents:available')`.
- On **disconnect**: `removeAgent`, update count.

**Frontend does not emit `agent:go_live` today**, so the agent pool is only populated if a client connects and sends that event (e.g. future work or manual testing).

### 4.6 Redis (`src/config/redis.js`)

- **Not a real Redis connection** in this repo: in-memory `Map` / `Set` mock for:
  - Hash-like `hSet` / `hGetAll`
  - Set ops `sAdd`, `sRem`, `sMembers`, `sMove`, `sCard`
- Purpose: local dev without installing Redis.

### 4.7 Twilio config (`src/config/twilio.js`)

Exports from env:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`
- `TWILIO_TWIML_APP_SID`

Plus `twilioClient` and `VoiceGrant` for JWT.

### 4.8 Unused / duplicate pieces

- **`src/routes/voiceRoutes.js`** defines routes under `/api/voice` with `/incoming` instead of `/incoming-call`. **`server.js` does not mount this router**; it registers routes directly.  
- **`src/app.js`** is a self-contained alternate server (different route wiring). **Not used** by `package.json` start script.

---

## 5. Frontend (`frontend/`)

### 5.1 Stack

- **React 18**, **Vite 5**
- **React Router 6** (`BrowserRouter`)
- **Zustand** (`useDialerStore`, `uiStore`)
- **TanStack Query** (`QueryClientProvider` in `main.jsx`)
- **@twilio/voice-sdk** (`Device` for WebRTC)
- **axios** for HTTP
- **framer-motion**, **lucide-react**, **recharts**, **react-hot-toast**, **react-error-boundary**

### 5.2 API base URL

`src/services/twilioService.js`:

```text
VITE_API_URL || 'http://localhost:3001'
```

Set `VITE_API_URL` in a Vite env file for non-local backends.

### 5.3 Routes (`src/App.jsx`)

- Lazy-loaded pages under `AppShell`.
- **`DialerOverlay`** is global (sibling to routes) so incoming/active calls overlay any page.

| Path | Page |
|------|------|
| `/` | Welcome |
| `/take-calls` | Take Calls wizard + go live |
| `/dashboard` | Dashboard |
| `/call-logs` | Call logs |
| `/script` | Placeholder “Agent Script” |
| `/billing` | Billing |
| `/licensed-states` | Licensed states |
| `/leads` | Placeholder “Leads (Beta)” |
| `/profile` | Profile |
| `/settings` | Placeholder |

### 5.4 Take Calls flow (`pages/TakeCallsPage.jsx`)

1. **Step 1:** Microphone + speaker test (Web Audio API, device enumeration).
2. **Step 2:** Category (life / health) then campaign (e.g. `final_expense`, `aca`, `medicare`).
3. **Step 3:** Rules + **Go Live** → `initializeTwilioDevice(mockAgentId, campaign)`.

`mockAgentId` is `agent_${random}` — **not** tied to auth or Socket.io id.

After Twilio registers, UI shows “Dialer Active” / listening state; **`DialerOverlay`** handles ring, accept, reject, mute, hang up, duration.

### 5.5 Twilio client (`services/twilioService.js`)

- POSTs to `/api/voice/token` with `{ identity, campaign }` (backend only **requires** `identity`).
- Instantiates `Device` with token, registers, handles `incoming`, `error`, etc.
- Updates **Zustand** `useDialerStore` for call state.

### 5.6 Dashboard (`pages/DashboardPage.jsx`)

- Uses **static zero** chart data and placeholder metrics (no live API yet).

---

## 6. Macro vs micro routing (`architecture/routing`)

This document explains **Trackdrive/Ringba** as macro-routing and the **Node + Redis** layer as micro-routing:

- Agents go live over WebSocket + Redis holds **campaign + licensed states**.
- Twilio webhook receives campaign + caller state; backend filters Redis for a qualified agent.
- **Atomic locks** (Redis `sMove` or DB `SELECT FOR UPDATE SKIP LOCKED`) avoid double-assigning one agent.

**Current code** implements the **Redis lock idea** and campaign match on `findAndLockAvailableAgent`, but **not** licensed-state filtering, and **no frontend WebSocket** registration yet.

---

## 7. Known integration gaps (important for debugging)

1. **Twilio Client identity:** Token uses `identity` from the browser; TwiML `<Client>` must use the **same** identity. Backend uses `socketId` when registering via Socket.io — **not** the same as `mockAgentId` unless you unify them.
2. **Agent pool:** `agent:go_live` is **not** called from the React app today, so **incoming routing may find no agent** unless something else registers agents.
3. **Campaign on webhook:** Incoming uses `req.query.campaign`; Twilio must pass that query param (or you change the handler to read body/custom fields).
4. **Duplicate server files:** Prefer **`server.js`** as source of truth; ignore `app.js` unless the project is refactored to use it.

---

## 8. Environment variables (backend)

From code and Twilio usage, expect at least:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default 3001) |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | REST client |
| `TWILIO_API_KEY_SID` | JWT access token |
| `TWILIO_API_KEY_SECRET` | JWT access token |
| `TWILIO_TWIML_APP_SID` | TwiML App SID for VoiceGrant |

Create a `.env` in `backend/` (ignored by git). **Do not commit secrets.**

---

## 9. Local development (typical)

1. **Backend:** `cd backend && npm install && npm run dev`  
   - Serves API + Socket.io on port **3001** (unless `PORT` is set).

2. **Frontend:** `cd frontend && npm install && npm run dev`  
   - Vite default **5173** (matches Socket.io CORS in `server.js`).

3. **Twilio:** Configure a Twilio number / TwiML App so that **incoming calls hit** `POST https://<your-host>/api/voice/incoming-call?campaign=<id>` (with `campaign` query param) or adjust the handler.

4. **Public URL:** For real Twilio webhooks, use **ngrok** or similar to expose the backend.

---

## 10. `pictures/` folder

Contains **screenshots** (PNG) used as design references; they are not loaded by the app at runtime unless referenced elsewhere.

---

## 11. Quick glossary

| Term | Meaning in this project |
|------|-------------------------|
| **AgentCalls / AGENTCALLS** | Product name used in the UI and architecture docs (browser workspace for insurance agents). |
| **Campaign** | Product line (e.g. `final_expense`, `aca`, `medicare`) used to match agents and routing; each has its own price and buffer rules in the UI. |
| **Buffer time** | Initial seconds of a call where the agent must follow stricter rules (e.g. no quoting, no personal numbers)—often tied to pay-per-call billing. |
| **Go live** | Agent ready to receive calls (UI + Twilio Device + intended Socket.io registration). |
| **Macro routing** | Upstream systems (e.g. Trackdrive/Ringba) deciding which number or buyer gets the call. |
| **Micro routing** | This platform’s job: pick **which logged-in agent** gets the call, with locking and eligibility. |
| **Pre-screening** | Optional vendor step before the agent; mentioned in campaign disclaimers. |
| **TwiML** | Twilio’s XML instructions for what happens on a call (say, dial, etc.). |
| **VoiceGrant** | JWT grant allowing the browser SDK to use Twilio Voice. |
| **amplify-project-** | GitHub repository / folder name; not the same as the user-facing **AgentCalls** brand. |

---

## 12. How to use this file with ChatGPT

Paste this document (or a section) when you want the model to:

- Answer **what the product is**, **who it is for**, **how campaigns and billing are supposed to work**, and **how calls flow**—start from **§1**.  
- Propose **consistent** Twilio identity + `<Client>` wiring  
- Add **socket.io-client** and connect `agent:go_live` to the **same** identity as Twilio  
- Extend the backend toward the **architecture** doc (Postgres, auth, billing) without guessing folder structure  
- Distinguish **placeholder UI** (dashboard zeros, script/leads/settings) from **working** Twilio + Express paths  

---

*Generated from repository contents and `architecture/` docs. Update this file when major features land (auth, DB, real Redis, Socket.io client).*
