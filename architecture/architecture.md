# System Architecture — CallsFlow Insurance Platform

> **Last updated:** April 2026  
> All sections reflect **what is actually implemented and running** in the codebase.

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
│   React 18 + Vite (Browser SPA)                                     │
│   ├── Pages / Components                                            │
│   ├── Zustand (Dialer + Auth + Theme State)                         │
│   ├── TanStack Query (Server State + Caching)                       │
│   ├── Firebase JS SDK (Auth — Google/Email Sign-in)                 │
│   └── Twilio Voice JS SDK (WebRTC Browser Calling)                  │
└────────────────────────┬────────────────────────────────────────────┘
                         │  HTTPS / WSS
┌────────────────────────▼────────────────────────────────────────────┐
│                         API SERVER                                  │
│   Node.js + Express 5 + Socket.io (single process, same port)       │
│   ├── Firebase Admin SDK (Auth token verification)                  │
│   ├── Voice Router (Twilio webhook handler + TwiML builder)         │
│   ├── Stripe Controller (Checkout, Subscriptions, Webhooks)         │
│   ├── User Controller (Firestore profile, settings, scripts)        │
│   ├── Admin Controller (platform metrics, phone routes)             │
│   ├── Support Controller (AI chat via Gemini, email via Nodemailer) │
│   └── Public Routes (Firebase web config for client SDK)            │
└──────┬─────────────────────────────────────────────┬────────────────┘
       │ REST + WebSocket                             │ External Webhooks
┌──────▼───────────────┐              ┌──────────────▼──────────────┐
│  Upstash Redis        │              │  Twilio / Stripe            │
│  ├── Agent pool sets  │              │  (POST to /api/voice/...    │
│  │   available        │              │   and /api/stripe/webhook)  │
│  │   ringing          │              └─────────────────────────────┘
│  │   busy             │
│  ├── Agent hashes     │         ┌──────────────────────────────────┐
│  │   campaignId        │         │  Google Firestore (Database)     │
│  │   licensedStates   │         │  ├── users/{uid}                 │
│  │   status           │         │  │   ├── callLogs/               │
│  │   lastCallAt (LRU) │         │  │   ├── transactions/           │
│  └── Heartbeat keys   │         │  │   ├── aiCoachingPlan/         │
│      agent:heartbeat  │         │  │   └── aiTrainingDrills/       │
│      (30s TTL)        │         │  ├── phoneRoutes/                │
└──────────────────────┘         │  └── adminMetrics/daily/days/    │
                                  └──────────────────────────────────┘
```

---

## Layer-by-Layer Breakdown

### 1. Frontend (React + Vite)

- **SPA** — React 18, Vite 5, React Router 6 (client-side routing)
- **Auth** — Firebase JS SDK handles sign-in (Google OAuth / Email). The Firebase ID token is attached as a `Bearer` header on every authenticated API call via a shared `apiFetch` wrapper
- **State management:**
  - `useDialerStore` (Zustand) — Twilio Device instance, call state, active call, duration
  - `useAuthStore` (Zustand) — Firebase user, UID
  - `themeStore` (Zustand) — light/dark/system theme preference
  - `useAudioSettingsStore` — mic/speaker device IDs, echo cancellation, noise suppression (persisted to Firestore)
- **TanStack Query** — server state caching for call logs, wallet, profile
- **Twilio Voice JS SDK** — WebRTC audio fully in the browser; no native app required

**Go Live flow (frontend):**
1. Agent completes the wizard (mic test → campaign select → rules acknowledge)
2. `initializeTwilioDevice(agentUID, campaign, licensedStates)` is called:
   - Connects `socket.io-client` to the backend → emits `agent:go_live`
   - Fetches a Twilio access token (`POST /api/voice/token`)
   - Registers `Twilio.Device` with that token
   - Starts a 30-second heartbeat interval (`agent:heartbeat`)
3. `DialerOverlay` renders globally on top of all pages, handling ring/accept/reject/mute/hangup
4. On disconnect or call end: emits `agent:release`, clears heartbeat

---

### 2. API Server (Node.js + Express 5 + Socket.io)

Single process, single port (`process.env.PORT`, default `3001`).

**Startup sequence:**
1. Parse CORS allowed origins from `CLIENT_URLS` env var (comma-separated)
2. Mount raw body parser for `/api/stripe/webhook` (signature verification requires raw bytes)
3. Connect to Upstash Redis (`connectRedis()`) — falls back to in-memory mock if `REDIS_URL` is not set
4. Verify mailer connection (`verifyMailer()`) — non-blocking
5. Initialize Socket.io handlers (`setupCallSockets(io)`)
6. Apply global rate limiter to all `/api/*` routes
7. Mount all route modules

**Route map:**

| Mount Point | Module | Auth |
|---|---|---|
| `POST /api/voice/token` | `voiceRoutes` | Firebase token |
| `POST /api/voice/incoming-call` | `voiceRoutes` | Twilio signature (Twilio → backend) |
| `POST /api/voice/call-completed` | `voiceRoutes` | Twilio signature (Twilio → backend) |
| `GET /api/voice/logs` | `voiceRoutes` | Firebase token |
| `GET /api/voice/recording/:sid` | `voiceRoutes` | Firebase token |
| `GET /api/users/me` | `userRoutes` | Firebase token |
| `PATCH /api/users/me` | `userRoutes` | Firebase token |
| `GET /api/users/me/bootstrap` | `userRoutes` | Firebase token |
| `GET /api/users/me/activity` | `userRoutes` | Firebase token |
| `GET /api/users/qa/summary` | `userRoutes` | Firebase token |
| `GET /api/users/ai-training/*` | `userRoutes` | Firebase token |
| `GET /api/stripe/wallet` | `stripeRoutes` | Firebase token |
| `POST /api/stripe/create-checkout` | `stripeRoutes` | Firebase token |
| `POST /api/stripe/verify-checkout` | `stripeRoutes` | Firebase token |
| `POST /api/stripe/create-subscription` | `stripeRoutes` | Firebase token |
| `POST /api/stripe/cancel-subscription` | `stripeRoutes` | Firebase token |
| `POST /api/stripe/webhook` | `stripeRoutes` | Stripe signature |
| `GET /api/admin/*` | `adminRoutes` | Firebase token + admin role |
| `POST /api/support/chat` | `supportRoutes` | Firebase token |
| `POST /api/support/email` | `supportRoutes` | Firebase token |
| `GET /api/public/firebase-config` | `publicRoutes` | None |
| `POST /api/auth/revoke` | `server.js` | Firebase token |
| `GET /health` | `server.js` | None |

---

### 3. Authentication

- **Firebase Auth** — all user authentication is handled by Firebase (Google OAuth, email/password)
- **Token verification** — every protected endpoint passes the Firebase ID token through `verifyFirebaseToken` middleware, which calls `admin.auth().verifyIdToken(idToken)`
- **Token delivery** — `Bearer <idToken>` in the `Authorization` header; query param `?token=` is also accepted for audio streaming endpoints (native `<audio>` tags cannot set custom headers)
- **Session revocation** — `POST /api/auth/revoke` calls `admin.auth().revokeRefreshTokens(uid)` to immediately invalidate all sessions for a user

---

### 4. WebSocket Layer (Socket.io)

Real-time events handled by `callSockets.js`:

```
Client → Server:
  agent:go_live        { campaign, agentId, licensedStates }
  agent:go_offline     {}
  agent:heartbeat      { agentId }
  agent:release        {}

Server → Client:
  agent:live_confirmed {}
  stats:agent_count    { count }
```

**On `agent:go_live`:**
- Clears any stale Redis state for the agent
- Calls `agentManager.registerAgent(agentId, { campaign, licensedStates })`
- Confirms with `agent:live_confirmed`
- Broadcasts updated `stats:agent_count`

**On `agent:heartbeat`:**
- Sets `agent:heartbeat:{agentId}` key in Redis with a 45-second TTL
- This prevents ghost agents — any agent whose heartbeat expires is evicted at routing time

**On disconnect / `agent:go_offline` / `agent:release`:**
- Removes agent from all Redis pool sets (available, ringing, busy)
- Clears the agent hash and heartbeat key
- Broadcasts updated count

---

### 5. Twilio Integration (Call Routing)

**Incoming call flow:**

```
Inbound Caller
     │
     ▼
Twilio Phone Number (configured in Twilio Dashboard)
     │
     ▼ (POST webhook)
Backend /api/voice/incoming-call
     │
     ├── Read `To` number → phoneRouteService.getCampaignByToNumber(To)
     │   (Firestore `phoneRoutes` collection maps each real number → campaignId)
     │   Falls back to query param ?campaign= or body.campaign, then 'fe_transfers'
     │
     ├── agentManager.findAndLockAvailableAgent(campaignId, callerState)
     │   ├── List 'agents:available' Redis set
     │   ├── Evict ghost agents (no heartbeat key)
     │   ├── Filter by campaignId match
     │   ├── Filter by licensedStates match (if callerState provided)
     │   ├── Sort by lastCallAt ascending (LRU — longest-waiting agent first)
     │   └── Atomic sMove: 'agents:available' → 'agents:ringing' (lock)
     │
     ├── If agent found:
     │   ├── agentManager.upsertActiveCall(agentId, callData) → moves to 'agents:busy'
     │   └── TwiML: <Dial action="/api/voice/call-completed" record="record-from-answer">
     │               <Client>{agentId}</Client>
     │             </Dial>
     │
     └── If no agent: TwiML: <Say>All agents are currently assisting other callers.</Say>
```

**Token generation (`POST /api/voice/token`):**
- Requires authenticated Firebase user
- `identity` in the request body must match `req.user.uid` (enforced server-side)
- Returns a Twilio `AccessToken` with `VoiceGrant` (incomingAllow: true)
- Twilio `<Client>` identity == Firebase UID == socket `agentId` — all three are unified

**Call completion (`POST /api/voice/call-completed`):**
- Called by Twilio after the call ends (action URL on the `<Dial>`)
- Parses: `From`, `To`, `DialCallDuration`, `DialCallStatus`, `CallSid`, `RecordingUrl`
- Calls `callLogService.logCall(...)` which:
  - Determines billability (`duration >= campaign.buffer && status === 'completed'`)
  - Auto-deducts credits via `walletService.deductCredits()`
  - Saves the call log to Firestore under `users/{agentId}/callLogs/`
  - Upserts `adminMetrics/daily/days/{date}` for platform-wide stats
- Dispatches `dispatchQaInsightJob()` asynchronously (non-blocking, fire-and-forget)
- Releases the agent back to `agents:available` (LRU position updated)

**Recording proxy (`GET /api/voice/recording/:recordingSid`):**
- Streams the MP3 from Twilio/S3 through the backend so the browser never needs Twilio credentials
- Handles HTTP `Range` headers for audio scrubbing and instant playback
- Intercepts Twilio's 302 redirect to S3, then re-fetches from S3 without the Basic Auth header (prevents AWS 400 errors)

**Phone number → Campaign routing (Firestore `phoneRoutes` collection):**
- Each document: `{ phoneE164, campaignId, label, active, createdAt, updatedAt }`
- Admin can create/update/delete routes via `adminRoutes`
- At call time: `getCampaignByToNumber(To)` resolves the campaign without a query param

---

### 6. Agent Pool (Upstash Redis)

| Redis Key | Type | Contents |
|---|---|---|
| `agents:available` | Set | Agent UIDs currently available |
| `agents:ringing` | Set | Agent UIDs locked for a ringing call |
| `agents:busy` | Set | Agent UIDs on an active call |
| `agent:{uid}` | Hash | `agentId, campaignId, licensedStates (JSON), status, joinedAt, lastCallAt` |
| `agent:heartbeat:{uid}` | String | TTL 45s; absence = ghost agent |
| `activecall:{uid}` | Hash | `callSid, from, to, campaignId, startedAt, state` |

**LRU routing:** Agents are sorted by `lastCallAt` (ascending) so the agent who has been waiting the longest gets the next call. On release, `lastCallAt` is updated to `Date.now()` so they move to the back of the queue.

**Ghost agent eviction:** At routing time, any agent in `agents:available` without a live `agent:heartbeat:{uid}` key is immediately evicted from Redis before the match loop runs.

**Concurrency safety:** The `sMove` command is atomic — exactly one routing request can claim any given agent at a time. If `sMove` returns 0, the agent was already taken and the router moves to the next LRU candidate.

---

### 7. Database (Google Firestore)

**No PostgreSQL or Prisma.** All persistence uses Firestore via Firebase Admin SDK.

**Data model:**

```
users/{uid}
  ├── name, email, bio, avatarUrl, role (agent|admin)
  ├── licensedStates: string[]          ← saved on profile; sent to Redis on Go Live
  ├── settings: { theme, notifications, audioInputDeviceId, ... }
  ├── scriptValues: { [scriptId]: { [field]: value } }
  ├── wallet: { balance (cents), plan, stripeCustomerId, stripeSubscriptionId }
  ├── apiKey, apiKeyRotatedAt
  ├── createdAt, updatedAt
  │
  ├── callLogs/{callLogId}
  │   ├── callSid, from, to, duration, campaign, campaignLabel
  │   ├── agentId, status, isBillable, cost, type, recordingUrl
  │   ├── qaInsight: { score, confidence, flags, summary, signals, source, version }
  │   └── createdAt, updatedAt
  │
  ├── transactions/{idempotencyKey | autoId}
  │   ├── type (credit | debit)
  │   ├── amountCents, description, source
  │   ├── metadata: { sessionId, invoiceId, callSid, ... }
  │   ├── balanceAfterCents
  │   └── createdAt
  │
  ├── aiCoachingPlan/current
  │   └── tasks/{taskId}
  │
  └── aiTrainingDrills/{drillId}

phoneRoutes/{routeId}
  ├── phoneE164, campaignId, label, active
  └── createdAt, updatedAt

adminMetrics/daily/days/{YYYY-MM-DD}
  ├── day, updatedAt
  ├── summary: { totalCalls, answeredCalls, missedCalls, billableCalls, totalDuration, totalCost }
  ├── campaigns: { [campaignId]: { calls, answeredCalls, billableCalls, totalDuration, totalCost } }
  └── agents: { [agentId]: { calls, answeredCalls, billableCalls, totalDuration, totalCost } }
```

---

### 8. Billing (Stripe + walletService)

**Credits wallet:**
- Stored as an integer (cents) in `users/{uid}/wallet.balance` in Firestore
- Top-ups: Stripe Checkout session (`mode: 'payment'`) → webhook `checkout.session.completed` → `walletService.addCredits()`
- Subscriptions: Stripe Checkout session (`mode: 'subscription'`) → webhook `invoice.paid` → `walletService.addCredits()` (weekly credits)
- Call deductions: triggered automatically in `callLogService.logCall()` after each billable call → `walletService.deductCredits()`
- **Idempotency:** All Stripe-sourced credit additions use a deterministic key (`stripe_pi_{paymentIntentId}` or `stripe_inv_{invoiceId}`). Firestore transactions ensure the credit is applied exactly once even if the webhook fires more than once

**Checkout fallback (`POST /api/stripe/verify-checkout`):**
- Called by the frontend when returning to `/billing?payment=success`
- Checks if the webhook already credited the user; if not, applies the credit (safety net for delayed webhook delivery)

**Subscription plans (`PLANS` in stripe config):**
- `silver` and `gold` — each maps to a Stripe Price ID (`STRIPE_PRICE_SILVER`, `STRIPE_PRICE_GOLD` in `.env`)
- Renewal credits are added automatically on each `invoice.paid` event
- Cancellation: `cancel_at_period_end: true` via `stripe.subscriptions.update()`

**Webhook events handled:**
- `checkout.session.completed` → credit top-up
- `invoice.paid` → subscription renewal credits
- `customer.subscription.updated` → update plan/subscriptionId in Firestore
- `customer.subscription.deleted` → revert to pay-as-you-go

---

### 9. QA Insight Pipeline (Gemini AI)

After every call completes:

1. `dispatchQaInsightJob()` is called — **fire-and-forget**, never blocks the HTTP response to Twilio
2. `runQaInsightJob()` calls `generateQaInsight(callMeta)` with up to 3 attempts (exponential backoff: 1s, 2s, 4s)
3. `generateQaInsight()` sends call metadata to `gemini-2.5-flash` (configurable via `GEMINI_MODEL` env var) and requests a JSON response:
   - `score` (0–100)
   - `confidence` (0–1)
   - `flags` (string array from allowed set)
   - `summary` (operational observation, max 240 chars)
   - `signals` (object with free-form fields)
4. If Gemini is unavailable or returns non-JSON, a **fallback insight** is generated from call metadata alone
5. The result is written back to `users/{agentId}/callLogs/{callLogId}` via `callLogService.attachQaInsight()`

**AI Training dashboard** (in `userController`):
- Reads call logs with `qaInsight` scores and derives:
  - Competency rubric (opening, discovery, compliance, objection handling, closing) via score/signal normalization
  - Trend over time, pattern analysis by campaign and state
  - Guided coaching plan with focus areas, drill templates, and anti-pattern examples
- 30-second in-memory cache per user per query scope to prevent Firestore over-fetching

---

### 10. Campaign Pricing

Defined in `backend/src/config/pricing.js` (`CAMPAIGN_CONFIG`):

| Campaign ID | Label | Price | Buffer |
|---|---|---|---|
| `fe_transfers` | FE Transfers | $35/lead | 120s |
| `fe_inbounds` | FE Inbounds | $25/call | 30s |
| `medicare_transfers` | Medicare Transfers | $25/lead | 120s |
| `medicare_inbounds_1` | Medicare Inbounds (1) | $35/call | 90s |
| `medicare_inbounds_2` | Medicare Inbounds (2) | $30/call | 90s |
| `aca_transfers` | ACA Transfers | $30/lead | 90s |

A call is **billable** if `duration >= campaign.buffer && status === 'completed'`. The cost is automatically deducted from the agent's Firestore wallet on completion.

---

### 11. Security

| Layer | Mechanism |
|---|---|
| Authentication | Firebase Auth ID tokens (verified server-side via Admin SDK) |
| Authorization | `verifyFirebaseToken` middleware on all protected routes |
| Admin routes | Additional `role === 'admin'` check on `/api/admin/*` |
| API protection | Global rate limiter on all `/api/*` routes |
| Twilio webhooks | Twilio signature validation |
| Stripe webhooks | `STRIPE_WEBHOOK_SECRET` signature verification (skipped in dev mode if env var is empty) |
| CORS | Strict allowlist from `CLIENT_URLS` env var |
| Transport | HTTPS/TLS (via hosting provider), WSS for WebSocket |
| Secrets | All secrets in `.env` (gitignored); never committed |
| Proxy trust | `app.set('trust proxy', 1)` for Hostinger/reverse proxy compatibility with rate limiting |

---

### 12. Environment Variables (Backend)

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3001) |
| `CLIENT_URLS` | Comma-separated allowed CORS origins |
| `CLIENT_URL` | Single origin fallback (used in Stripe redirect URLs) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (REST client + recording proxy) |
| `TWILIO_API_KEY_SID` | API Key SID for JWT access tokens |
| `TWILIO_API_KEY_SECRET` | API Key secret for JWT access tokens |
| `TWILIO_TWIML_APP_SID` | TwiML App SID for VoiceGrant |
| `REDIS_URL` | Upstash Redis URL (`rediss://...`); omit to use in-memory mock |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (required in production) |
| `STRIPE_PRICE_SILVER` | Stripe Price ID for Silver plan |
| `STRIPE_PRICE_GOLD` | Stripe Price ID for Gold plan |
| `GEMINI_API_KEY` | Google AI API key for QA insight generation |
| `GEMINI_MODEL` | Model name (default: `gemini-2.5-flash`) |
| `EMAIL_HOST` | SMTP host for support emails (Nodemailer) |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password |
| `SUPPORT_EMAIL_TO` | Destination address for support email tickets |

**Firebase** is configured via a `firebase-service-account.json` file in the backend root (gitignored).

---

### 13. Local Development

```
# Backend
cd backend && npm install && npm run dev
# → Express + Socket.io on http://localhost:3001
# → Uses in-memory Redis mock if REDIS_URL is not set
# → Firebase Admin works if firebase-service-account.json is present

# Frontend
cd frontend && npm install && npm run dev
# → Vite dev server on http://localhost:5173

# For live Twilio webhooks:
# Use ngrok or similar to expose :3001
# Set Twilio webhook URL to: https://<ngrok-url>/api/voice/incoming-call
```

---

### 14. End-to-End Call Flow (Complete)

```
[Agent Opens Browser]
       ↓
[Firebase Login] → ID token stored in auth state
       ↓
[App loads] → GET /api/users/me/bootstrap → Populate profile + wallet
       ↓
[Take Calls Wizard]
  Step 1: Mic/speaker test (Web Audio API)
  Step 2: Select campaign + category
  Step 3: Review call rules → Go Live
       ↓
[Go Live]
  → socket.io connects → emits agent:go_live { campaign, agentId: uid, licensedStates }
  → Backend: registerAgent() → Redis available set + heartbeat
  → POST /api/voice/token → Twilio AccessToken (identity = uid)
  → Twilio.Device.register() → browser is now a Twilio client
  → Heartbeat interval starts (every 30s)
       ↓
[Inbound call arrives at Twilio number]
  → Twilio POSTs to /api/voice/incoming-call
  → Resolve campaign from To number (phoneRoutes Firestore collection)
  → findAndLockAvailableAgent(campaign, callerState)
      Ghost eviction → campaign filter → state filter → LRU sort → atomic sMove lock
  → TwiML <Dial record="record-from-answer"><Client>{uid}</Client></Dial>
       ↓
[Browser rings] → DialerOverlay shows incoming UI → Agent accepts
       ↓
[Call active] → Duration timer starts in browser
       ↓
[Call ends] (agent hangs up, caller hangs up, or timeout)
  → socket.emit('agent:release')
  → Twilio POSTs to /api/voice/call-completed
      → logCall(): billability check, auto-deduct credits, save to Firestore
      → adminMetrics updated (increments)
      → dispatchQaInsightJob() (async, non-blocking)
      → releaseAgent() → back to agents:available (LRU updated)
       ↓
[QA insight generated] (background, up to 3 attempts)
  → Gemini 2.5 Flash analyzes call metadata
  → qaInsight attached to callLogs/{callLogId}
       ↓
[Dashboard / Call Logs update]
  → Call log appears with duration, status, cost, Play button
  → Wallet balance reflects deduction
  → AI Training page picks up new scorecard on next fetch
```

---

### 15. Folder Structure

```
amplify-project/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/      ← AppShell, Sidebar, AnnouncementBanner
│   │   │   └── ui/          ← DialerOverlay, PageLoader, PageTransition
│   │   ├── pages/           ← All route-level pages
│   │   ├── store/           ← Zustand stores (dialer, auth, theme, audio)
│   │   ├── services/        ← apiClient, twilioService, supportService
│   │   ├── hooks/           ← Custom React hooks
│   │   ├── config/          ← apiBase, firebase client config
│   │   └── styles/          ← global.css, variables.css
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── config/          ← redis, twilio, stripe, firebaseAdmin, firestoreDb, mailer, pricing
│   │   ├── controllers/     ← voice, stripe, user, admin, support (chat + email)
│   │   ├── middleware/       ← auth (verifyFirebaseToken), security (rate limiter), supportUpload
│   │   ├── models/          ← (reserved; no ORM — Firestore used directly)
│   │   ├── queues/          ← qaQueue (in-process async job runner)
│   │   ├── routes/          ← voice, stripe, user, admin, support, public, webhook
│   │   ├── services/        ← agentManager, callLogService, walletService,
│   │   │                       phoneRouteService, qaInsightService, userDataService,
│   │   │                       supportChatService
│   │   ├── sockets/         ← callSockets (Socket.io event handlers)
│   │   ├── support/         ← support-related assets/templates
│   │   ├── utils/           ← phoneUtils, etc.
│   │   └── server.js        ← Entry point
│   ├── firebase-service-account.json   ← gitignored; required for Firebase Admin
│   ├── .env                            ← gitignored
│   └── package.json
│
├── architecture/            ← This document
├── pictures/                ← UI screenshots / design references
└── README.md
```