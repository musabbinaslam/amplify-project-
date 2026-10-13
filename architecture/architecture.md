# System Architecture — CallsFlow

> Reflects the code on `TEST`. Route modules live in `backend/src/routes/` — this doc does not enumerate every endpoint.

---

## High-level overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT — React 18 + Vite SPA                                       │
│  Zustand · TanStack Query · Firebase JS SDK · Twilio Voice JS SDK   │
└────────────────────────┬────────────────────────────────────────────┘
                         │  HTTPS / WSS
┌────────────────────────▼────────────────────────────────────────────┐
│  API — Node.js + Express 5 + Socket.io                              │
│  PM2 cluster (see backend/ecosystem.config.cjs.example)             │
│  Socket.IO Redis adapter when REDIS_URL is set                      │
└──────┬─────────────────────────────────────────────┬────────────────┘
       │                                             │
┌──────▼───────────────┐              ┌──────────────▼──────────────┐
│  Upstash Redis        │              │  Twilio / Stripe webhooks   │
│  pool:{seg}:{camp}    │              │  /api/voice/*  /api/stripe  │
│  agents:data (hash)   │              └─────────────────────────────┘
│  agent:heartbeat:{id} │         ┌──────────────────────────────────┐
│  ZREM as atomic lock  │         │  Google Firestore (only DB)      │
└──────────────────────┘         │  no PostgreSQL                   │
                                  └──────────────────────────────────┘
```

---

## 1. Frontend (React + Vite)

- SPA: React 18, Vite 5, React Router 6
- Auth: Firebase JS SDK (Google / email). `apiFetch` attaches the Firebase ID token as `Bearer`
- Zustand: `useDialerStore`, `authStore`, `themeStore`, `audioSettingsStore`, plus UI / support stores
- **TanStack Query is live** — `frontend/src/queries/`, `frontend/src/lib/queryClient.js`, `QueryClientProvider` in `frontend/src/main.jsx` (wallet, campaign pricing, call logs)
- Twilio Voice JS SDK runs WebRTC in the browser

**Take Calls wizard (4 steps)** in `TakeCallsPage.jsx`: mic/speaker → campaign → licensed states → review / Go Live.

**Go Live** (`initializeTwilioDevice` in `frontend/src/services/twilioService.js`):

1. Socket connects and emits `agent:go_live` `{ campaign, agentId, licensedStates, sessionId, agencyId }`
2. Backend replies `agent:live_pending` (session accepted; **not** in the routing pool yet)
3. `POST /api/voice/token` then `Twilio.Device.register()`
4. On `device.on('registered')` the client emits `agent:pool_ready`
5. Backend registers the agent and emits `agent:live_confirmed`
6. Heartbeat interval: **10s** (`HEARTBEAT_INTERVAL_MS`)

`DialerOverlay` handles ring / accept / reject / mute / hangup. Disconnect or hangup emits `agent:release` / `agent:go_offline` and clears the heartbeat.

---

## 2. API server

Express 5 + Socket.io on `process.env.PORT` (default `3001`). Production is **not** a single process: `backend/ecosystem.config.cjs.example` runs PM2 `instances: 2` / `exec_mode: 'cluster'`. `server.js` enables the Socket.IO Redis adapter when `REDIS_URL` is set (required in production / multi-instance).

Startup (see `backend/src/server.js`): sync `CAMPAIGN_CONFIG` from Firestore, load AI Flags settings, connect Redis, attach the Redis adapter, verify mailer (non-blocking), `setupCallSockets` + `setupSupportSockets`, mount `/api/*` behind the global rate limiter.

**HTTP surface:** `backend/src/routes/` (`voice`, `user`, `stripe`, `admin`, `qa`, `manager`, `agency`, `agencyInvite`, `leaderboard`, `support`, `supportDesk`, `public`, `webhook`, `persona`, `referral`). Also `POST /api/auth/revoke` and `GET /health` in `server.js`.

---

## 3. Authentication and roles

- Firebase Auth (Google OAuth, email/password)
- `verifyFirebaseToken` (`backend/src/middleware/auth.js`) verifies the ID token. `Authorization: Bearer <idToken>`, or `?token=` for `<audio>` (cannot set headers)
- `POST /api/auth/revoke` → `admin.auth().revokeRefreshTokens(uid)`

Platform roles are not agent|admin-only. `backend/src/utils/tenancy.js` treats **`admin`, `qa`, `manager`, `support`** as platform roles. Agency membership uses `agency_admin` / `agency_agent` (often on `agencyRole`). Default user role is `agent`. Route gates: `requireAdmin`, `requireQaOrAdmin`, `requireManager`, `requireAgencyAdmin`, `requireSupportOrAdmin`.

---

## 4. WebSocket (Socket.io)

Handlers in `backend/src/sockets/callSockets.js`.

**Client → server:** `agent:go_live`, `agent:pool_ready`, `agent:go_offline`, `agent:heartbeat` `{ agentId, sessionId }`, `agent:release`, `agent:wrap_up`, `agent:call_incoming`, `agent:call_accepted`, `notification:register` / `unregister`

**Server → client:** `agent:live_pending`, `agent:live_confirmed`, `agent:go_live_error`, `agent:forced_offline`, `agent:flagged`, `stats:agent_count`

`agent:go_live` checks flagged / Persona verified / campaign access / pause / wallet, then stores a pending payload and emits `live_pending`. **`registerAgent` runs only on `agent:pool_ready`.**

Heartbeat: Redis key `agent:heartbeat:{agentId}` with **TTL 35s** (`HEARTBEAT_TTL_SECONDS` in `callSockets.js`, passed into `agentManager.touchHeartbeat`). Session mismatch is ignored.

---

## 5. Twilio and inbound routing

`POST /api/voice/incoming-call` (`voiceController.js`):

1. Campaign from query/body `campaign` if present; else `phoneRouteService.getRouteByToNumber(To)` (`phoneRoutes` in Firestore); else **`fe_inbounds_short`**
2. Optional Ringba pre-lock: `consumeReservation(From)` (agent already `ZREM`'d)
3. Else `findAndLockAvailableAgent(campaign, callerState, …)`
4. Agent found → TwiML `<Dial>` to `<Client>{agentId}</Client>` (ACA transfers use a conference). No agent → spoken reject
5. `POST /api/voice/call-completed` → `callLogService.logCall` (billability, wallet debit, Firestore log, `adminMetrics`) then `releaseAgent`. **`dispatchQaAudioReviewJob`** is fire-and-forget (also from `recording-complete`)

**Token:** `POST /api/voice/token` — `identity` must match `req.user.uid`. Twilio `<Client>` identity == Firebase UID == socket `agentId`.

**Recording proxy:** `GET /api/voice/recording/:recordingSid` streams Twilio/S3 MP3 through the API (Range support; follows Twilio 302 without sending Basic Auth to S3).

---

## 6. Agent pool (Redis)

Live design is in `backend/src/services/agentManager.js` — **not** a global `agents:available` set and **not** `SMOVE`.

| Key | Type | Role |
|---|---|---|
| `pool:{segment}:{campaignId}` | Sorted set | Score = `lastCallAt` ms (`0` = never called). `segment` is `platform` or agency id |
| `agents:data` | Hash | JSON per agent: campaign, agency, licensedStates, status, sessionId, lastCallAt |
| `agents:ringing` / `agents:busy` | Sets | Ringing / in-call |
| `agent:heartbeat:{id}` | String | TTL **35s**; value = session id |
| `agents:heartbeats` | Sorted set | Sweeper index |
| `activecalls:data` | Hash | Live call metadata |

Routing: `ZRANGE` up to 50 LRU candidates → heartbeat / hash checks → licensed-state filter (empty list = all states) → **`ZREM` as the lock** (return `1` wins). Ghosts (no heartbeat / session mismatch) are evicted during the scan.

---

## 7. Database (Firestore only)

**No PostgreSQL.** Persistence is Firebase Admin + Firestore (`firestoreDb`).

Core paths used by calling / billing / QA:

```
users/{uid}
  role, agencyId / agencyRole, licensedStates, settings, wallet
  wallet: { balance (cents), stripeCustomerId }
  callLogs/{id}     — duration, campaign, isBillable, cost, recording*,
                      qaAudioReview (AI Flags), leftover qaInsight (see §9)
  transactions/{id}
  aiCoachingPlan/current, aiTrainingDrills/{id}

phoneRoutes/{id}              — phoneE164 → campaignId (+ agency)
system/pricing                — live CAMPAIGN_CONFIG overlay
adminMetrics/daily/days/{day}
```

Other collections (agencies, support threads, contests, …) exist; this is not a full inventory.

---

## 8. Billing (wallet, not subscriptions)

`stripeRoutes.js` exposes **`GET /wallet`**, **`POST /create-checkout`**, **`POST /verify-checkout`**, **`POST /webhook`**. There are no create-/cancel-subscription routes and no `PLANS` silver/gold.

- Wallet is cents on `users/{uid}.wallet.balance` (`walletService.getWallet` returns `{ balance, stripeCustomerId }`)
- Top-up: Stripe Checkout `mode: 'payment'` → webhook **`checkout.session.completed`** → `addCredits`. Idempotency key `stripe_pi_{paymentIntentId}` (or `stripe_cs_{session.id}`)
- `verify-checkout` is the return-URL safety net if the webhook is late
- Call debit: `callLogService.logCall` → `walletService.deductCredits`
- Credit amounts: `CREDIT_TIERS` in `backend/src/config/stripe.js`

The webhook handler only acts on `checkout.session.completed`. It does not handle `invoice.paid` or subscription lifecycle events.

---

## 9. AI Flags and AI Training

**AI Flags (live):** `dispatchQaAudioReviewJob` (`qaQueue.js`) → `generateQaAudioReview` (`qaInsightService.js`) → `callLogService.attachQaAudioReview`. Stored as **`qaAudioReview`**. Gated by `AI_FLAGS_GEMINI_ENABLED`. Triggered from call completion and `recording-complete`. There is no `dispatchQaInsightJob` / `generateQaInsight` / `attachQaInsight` writer.

**AI Training** still serves `/api/users/me/ai-training/*`. Its scores read leftover `qaInsight` fields on call logs that **no current job writes**.

---

## 10. Campaign pricing

Defaults in `backend/src/config/pricing.js` (`CAMPAIGN_CONFIG`), overwritten in place from Firestore `system/pricing` at startup (`syncPricingConfig`). Seed defaults:

| ID | Label | Price | Buffer |
|---|---|---|---|
| `fe_inbounds_short` | FE Inbounds Short Duration | $25 | 10s |
| `fe_inbounds` | FE Inbounds | $50 | 90s |
| `fe_tv_calls` | FE TV Calls | $65 | 30s |
| `medicare_transfers` | Medicare Transfers | $25 | 120s |
| `medicare_inbound_1` | Medicare Inbounds (1) | $35 | 90s |
| `medicare_inbound_2` | Medicare Inbounds (2) | $15 | 15s |
| `aca_transfers` | ACA Transfers | $30 | 120s |

Billable when `status === 'completed'` and duration meets the buffer (`isRaw` campaigns bill on connect). Cost is deducted from the agent wallet.

---

## 11. Security

| Layer | Mechanism |
|---|---|
| Auth | Firebase ID tokens via Admin SDK |
| Authorization | Role middleware on admin / QA / manager / agency / support mounts |
| API | Global rate limiter on `/api/` (`express-rate-limit`, per process) |
| Twilio | Signature validation (`TWILIO_VALIDATE_WEBHOOKS` / production) |
| Stripe | `STRIPE_WEBHOOK_SECRET`; skipped in dev if unset |
| CORS | Allowlist from `CLIENT_URLS` |
| Transport | HTTPS / WSS in deployed environments |
| Secrets | `.env` (gitignored); never committed |
| Proxy | `app.set('trust proxy', 1)` for rate-limit + forwarded proto |

---

## 12. Environment

Template: `backend/.env.example`. Names that the server actually reads include `PORT`, `NODE_ENV`, `API_BASE_URL`, `VOICE_WEBHOOK_BASE_URL`, `CLIENT_URLS` / `CLIENT_URL`, Twilio keys, `REDIS_URL` / `REDIS_KEY_PREFIX`, `REQUIRE_REDIS_ADAPTER`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY` / `GEMINI_MODEL`, `AI_FLAGS_GEMINI_ENABLED`, SMTP + `SUPPORT_TO_EMAIL`, Sentry, Firebase Admin + web config fields (web config served at `GET /api/public/firebase-config`).

---

## 13. Local development

```
cd backend && npm install && npm run dev   # :3001; in-memory Redis if REDIS_URL unset
cd frontend && npm install && npm run dev  # :5173
```

For Twilio webhooks, expose `:3001` (ngrok or similar) to `/api/voice/incoming-call`.

---

## 14. End-to-end call path

```
Firebase login → GET /api/users/me/bootstrap
Take Calls wizard (4 steps, including licensed states)
Go Live:
  agent:go_live → live_pending
  POST /api/voice/token → Device.register()
  agent:pool_ready → Redis pool + heartbeat (10s / 35s TTL) → live_confirmed
Inbound:
  Twilio → /api/voice/incoming-call
  phoneRoutes or fallback fe_inbounds_short
  ZRANGE + licensed-state filter + ZREM lock
  TwiML Dial Client {uid}
Call end:
  logCall (bill + Firestore + adminMetrics)
  dispatchQaAudioReviewJob → qaAudioReview
  releaseAgent (LRU score updated)
```

---

## 15. Folder map (files that exist)

```
frontend/src/
  components/layout/   AppShell, Sidebar, Topbar
  components/ui/       DialerOverlay, PageLoader, …
  pages/               route-level screens
  store/               Zustand
  services/            apiClient, twilioService, stripeService, …
  queries/             TanStack Query hooks
  lib/queryClient.js
  hooks/, config/, styles/

backend/src/
  config/              redis, twilio, stripe, firebaseAdmin, firestoreDb, mailer, pricing
  controllers/
  middleware/          auth, role gates, security, uploads
  queues/              qaQueue (in-process AI Flags runner)
  routes/              full HTTP surface
  services/            agentManager, callLogService, walletService,
                       phoneRouteService, qaInsightService (audio review), …
  sockets/             callSockets, supportSockets, socketRegistry
  server.js
```
