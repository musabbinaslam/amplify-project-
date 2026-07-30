# CallsFlow API — Ops Runbook (Hostinger VPS)

Production API hostname: **`https://api.callsflow.io`**  
Frontend: Vercel (SPA). Keep `VITE_API_URL=https://api.callsflow.io` — do not invent a new API domain.

Related files:
- [`.env.example`](../.env.example) — production env template
- [`nginx-api.callsflow.io.conf.example`](./nginx-api.callsflow.io.conf.example) — production nginx
- [`nginx-api-new.callsflow.io.conf.example`](./nginx-api-new.callsflow.io.conf.example) — dry-run nginx
- [`provision-vps.sh.example`](./provision-vps.sh.example) — Ubuntu bootstrap (ufw, Node, PM2, nginx, certbot)
- [`../ecosystem.config.cjs.example`](../ecosystem.config.cjs.example) — PM2 cluster (`instances: 2`)
- [`../scripts/hostinger-deploy.sh`](../scripts/hostinger-deploy.sh)
- [`../scripts/update-backend.sh`](../scripts/update-backend.sh) — manual VPS update from `staging` or `main`

**Phase 3 cutover path:** dry-run on `api-new.callsflow.io` → load-test → flip `api.callsflow.io` DNS. See [§11 Phase 3 — Provisioning](#11-phase-3--provisioning).

---

## 1. Pre-cutover env checklist

Copy the current host `.env` onto the new VPS, then confirm:

| Variable | Expected production value |
|----------|---------------------------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `API_BASE_URL` | `https://api.callsflow.io` |
| `VOICE_WEBHOOK_BASE_URL` | `https://api.callsflow.io` |
| `CLIENT_URLS` | `https://callsflow.io,https://www.callsflow.io` (+ stage if needed) |
| `CLIENT_URL` | `https://www.callsflow.io` |
| `REDIS_URL` | Upstash `rediss://…` (required) |
| `REDIS_KEY_PREFIX` | empty on prod; use `vpsdry:` only during dry-run load tests (see §11) |
| `TWILIO_VALIDATE_WEBHOOKS` | `true` |
| `STRIPE_WEBHOOK_SECRET` | matches Stripe Dashboard signing secret |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` | set / `production` |

Full list: [`.env.example`](../.env.example).

- [ ] Env copied and public URL vars verified  
- [ ] Verified on ______ / by ______

---

## 2. Frontend (Vercel)

- [ ] Production env: `VITE_API_URL=https://api.callsflow.io`
- [ ] Redeploy **only if** that var was wrong (DNS flip alone does not require a frontend rebuild)
- [ ] `VITE_SENTRY_DSN` / `VITE_SENTRY_ENVIRONMENT=production` still set if using Sentry

- [ ] Verified on ______ / by ______

---

## 3. Nginx + TLS

1. Install nginx + certbot on the VPS (or run [`provision-vps.sh.example`](./provision-vps.sh.example)).
2. **Dry-run first:** use [`nginx-api-new.callsflow.io.conf.example`](./nginx-api-new.callsflow.io.conf.example) + DNS `api-new` → new VPS IP.
3. After load tests: install [`nginx-api.callsflow.io.conf.example`](./nginx-api.callsflow.io.conf.example); certbot for `api.callsflow.io` **after** DNS flip (default).
4. `nginx -t && systemctl reload nginx`

Sticky sessions are **not** required (Socket.IO rooms + Redis adapter).

---

## 4. Deploy

### First boot on VPS

```bash
cd /path/to/backend
cp ecosystem.config.cjs.example ecosystem.config.cjs   # set real cwd
# place .env
npm install --production
./scripts/record-release.sh
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow printed instructions
```

### Subsequent deploys

**Manual update from VPS (recommended after pushing to GitHub):**

Staging tracks the `TEST` branch; production tracks `main`.

```bash
cd <backend app dir>   # find it: ls -d /var/www/*/backend /home/*/*/backend 2>/dev/null
./scripts/update-backend.sh
# Menu: 1) TEST (staging)  2) main (production)
# Or non-interactive:
./scripts/update-backend.sh TEST
./scripts/update-backend.sh main
# → git fetch / checkout / pull --ff-only
# → hostinger-deploy.sh (npm install, record-release, pm2 reload)
```

Use the branch that matches this host's `.env` (staging credentials on staging, production on main). The script updates code only — it does not change `.env` or Firebase keys.

**If you already pulled manually:**

```bash
# On server after git pull, or over SSH:
cd /path/to/backend
./scripts/hostinger-deploy.sh [<git_sha>]
# → npm install --production
# → record-release.sh
# → pm2 reload backend
```

### Verify after every deploy

```bash
curl -sS https://api.callsflow.io/health
curl -sS https://api.callsflow.io/api/public/release
pm2 status
pm2 logs backend --lines 50
```

Expect `/health` → `status: "ok"` and `redis: "up"` (HTTP 200).  
Expect `/api/public/release` → current SHA / release id.

During dry-run, use `https://api-new.callsflow.io` instead.

---

## 5. Rollback

| Layer | Action | When |
|-------|--------|------|
| **App** | Checkout previous SHA → `./scripts/hostinger-deploy.sh <sha>` → confirm `/api/public/release` | Bad release; infra OK |
| **DNS** | Point `api.callsflow.io` A/AAAA back to old host IP; wait TTL | New VPS / TLS / total outage |
| **Cutover safety** | Keep old host warm until Phase 4 smoke tests pass | During cutover window |

Debug: `pm2 logs backend --lines 200`, Sentry, Upstash console.

- [ ] Rollback drill understood / old IP recorded: ______

---

## 6. Twilio / Stripe dashboard verification

### Twilio Console

- [ ] Voice webhook (number / TwiML App): `https://api.callsflow.io/api/voice/incoming-call`
- [ ] Server has `VOICE_WEBHOOK_BASE_URL=https://api.callsflow.io` so Dial `action` / `statusCallback` stay on the same host
- [ ] After DNS flip: one test inbound call succeeds

Verified on ______ / by ______

### Stripe Dashboard

- [ ] Webhook endpoint: `https://api.callsflow.io/api/stripe/webhook`
- [ ] Signing secret matches `STRIPE_WEBHOOK_SECRET` on the VPS
- [ ] After cutover: test event or small checkout

Verified on ______ / by ______

**Do not** point Twilio/Stripe at `api-new.callsflow.io` — dry-run is for health/socket load only.

---

## 7. Monitoring

| Signal | Where |
|--------|--------|
| App errors | Sentry (`SENTRY_DSN` backend + `VITE_SENTRY_DSN` frontend) |
| Process health | `pm2 status` / `pm2 monit` |
| Liveness | `GET /health` (Redis-aware; 503 in production if Redis down) |
| Release | `GET /api/public/release` |
| Host | Hostinger VPS CPU / RAM / disk — alert ~80% |
| Redis | Upstash command rate / latency during load tests |

---

## 8. Load-test procedure

Run **before** public cutover (against `api-new` on the new VPS, or local 2-process dry run). Media stays on Twilio — these tests do not open WebRTC Devices.

### A. Multi-node socket emit

With PM2 already at `instances: 2` on the VPS:

```bash
CONNECT_URL=https://api-new.callsflow.io node scripts/test_multinode_emit.js
```

Or locally:

```bash
PORT=3001 node src/server.js
PORT=3002 node src/server.js
node scripts/test_multinode_emit.js
```

Pass: cross-process `test:multinode` received.

### B. Redis routing concurrency

```bash
# Prefer REDIS_KEY_PREFIX=vpsdry: on the new box during dry-run so fake agents
# do not collide with live production pool keys.
node scripts/load_test_concurrent_calls.js --agents 300 --concurrent 200 --campaign fe_tv_calls
```

Pass: locks complete; routing time stable (target p95 under ~500ms).  
Cleanup: remove `loadtest-*` / `vpsdry:` keys after tests (or flush only the prefixed keys).

### C. Socket scale (500 → 1k)

```bash
node scripts/load_test_sockets.js --url https://api-new.callsflow.io --clients 500 --duration 120
node scripts/load_test_sockets.js --url https://api-new.callsflow.io --clients 1000 --duration 120
```

While running, watch: `pm2 monit`, Hostinger CPU/RAM, Upstash ops.

Pass criteria:
- Connect success high (aim ≥ 99%)
- Unexpected disconnect rate low during the duration window
- Node RSS/CPU acceptable for the VPS size (4 vCPU / 16 GB)
- Redis latency not spiking into multi-second territory

**Do not flip DNS until A–C pass.**

---

## 9. Cutover order (Phase 3 → 4 summary)

1. Lower DNS TTL for `api.callsflow.io` (~24h ahead)  
2. Buy/provision VPS (see §11) → nginx dry-run → PM2 cluster → env  
3. Health + release + multinode emit + socket load test on `api-new`  
4. Flip DNS A/AAAA for `api.callsflow.io` → new VPS; clear `REDIS_KEY_PREFIX` if used  
5. Certbot for `api.callsflow.io`; confirm HTTPS + Socket.IO  
6. Re-check Twilio / Stripe / Phase 4 product smoke  
7. Keep old host standby → decommission after confidence window  

---

## 10. Known day-one caveats

- Rate limits are **per PM2 process** (in-memory). With `instances: 2`, effective cap ≈ 2× configured max.
- QA insight jobs are still in-process (not a shared queue). Defer BullMQ unless duplicate Gemini spend appears.
- `/health` returning 503 when Redis is down in production is intentional for multi-node safety.
- Stay on **PM2 `instances: 2`** for day one on 4 vCPU; only raise after measuring CPU under real call load.

---

## 11. Phase 3 — Provisioning

You buy and SSH into Hostinger; this section is the install checklist. Repo helpers: [`provision-vps.sh.example`](./provision-vps.sh.example), nginx samples above.

### 11.1 Hardware (locked recommendation)

| Spec | Choice |
|------|--------|
| CPU / RAM | **4 vCPU / 16 GB** |
| Disk / bandwidth | **200 GB / 16 TB** |
| Location | **US – Boston** (East Coast; aligns with Twilio Ashburn) |
| OS | **Ubuntu 24.04 LTS** (fallback: 22.04 LTS) |
| PM2 | **`instances: 2`** day one |

Overspec 8/32/400/32TB is optional — not required for 500–1k agents.

- [ ] VPS ordered  
- [ ] Public IPv4 recorded: ______  
- [ ] **Old** `api.callsflow.io` IP recorded (rollback): ______  
- [ ] TTL for `api.callsflow.io` lowered (e.g. 300s): ______

### 11.2 SSH + firewall

```bash
# After first SSH login — or run provision-vps.sh.example
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do **not** expose Node `PORT` 3001 publicly — nginx only proxies to `127.0.0.1:3001`.

- [ ] Firewall active (22/80/443)  
- [ ] After app start: `ss -tlnp` shows 3001 on localhost only

### 11.3 Install stack

Prefer copying [`provision-vps.sh.example`](./provision-vps.sh.example) to the server and running it, or manually:

```bash
# Node 22 LTS + PM2 + nginx + certbot + git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git
sudo npm install -g pm2
node -v && pm2 -v && nginx -v
```

### 11.4 Deploy backend

```bash
sudo mkdir -p /var/www/callsflow && sudo chown "$USER:$USER" /var/www/callsflow
cd /var/www/callsflow
git clone <YOUR_REPO_URL> app
cd app/backend
cp .env.example .env
# Paste secrets from current host. Keep:
#   API_BASE_URL=https://api.callsflow.io
#   VOICE_WEBHOOK_BASE_URL=https://api.callsflow.io
# During dry-run load tests that write Redis pools, set:
#   REDIS_KEY_PREFIX=vpsdry:
cp ecosystem.config.cjs.example ecosystem.config.cjs
# Edit cwd → /var/www/callsflow/app/backend
npm install --production
./scripts/record-release.sh
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### 11.5 Dry-run hostname (`api-new`)

1. DNS: `api-new.callsflow.io` A → **new VPS IP** (does not affect production).  
2. Install [`nginx-api-new.callsflow.io.conf.example`](./nginx-api-new.callsflow.io.conf.example).  
3. `sudo certbot --nginx -d api-new.callsflow.io`  
4. `curl -sS https://api-new.callsflow.io/health` → `status: ok`, `redis: up`  
5. Run §8 load tests against `https://api-new.callsflow.io`

- [ ] api-new HTTPS healthy  
- [ ] Multinode emit + routing + 500/1k sockets passed  

### 11.6 Flip production DNS

1. Confirm old IP written down.  
2. Set `api.callsflow.io` A (AAAA if any) → **new VPS IP**.  
3. `dig +short api.callsflow.io` until it shows the new IP.  
4. Install production nginx site; `sudo certbot --nginx -d api.callsflow.io`.  
5. If dry-run used `REDIS_KEY_PREFIX=vpsdry:`, clear it in `.env` and `pm2 reload backend`.  
6. Confirm:

```bash
curl -sS https://api.callsflow.io/health
CONNECT_URL=https://api.callsflow.io node scripts/test_multinode_emit.js
```

7. Keep **old host running** until Phase 4 smoke passes.

- [ ] api.callsflow.io HTTPS + Socket.IO confirmed  
- [ ] Old host still warm  

### 11.7 Redis prefix note

| Phase | `REDIS_KEY_PREFIX` |
|-------|-------------------|
| Dry-run load tests on new box | `vpsdry:` (isolates fake agents from live pools) |
| After DNS flip (serving real traffic) | **empty** |

Clean up `vpsdry:` keys / `loadtest-*` members after dry-run tests.
