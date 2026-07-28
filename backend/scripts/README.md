# Ops mock seed scripts

Rich analytics mock data for **agency** and **manager** ops dashboards (`/app/admin/ops/agencies` and `/app/admin/ops/teams`).

## Prerequisites

- Firebase Admin configured in `backend/.env`
- Firestore users already exist (seed does **not** create Auth accounts)
- **~30 platform users** recommended (`agencyId: null`, not `admin` / `qa`):
  - 2 manager teams × (1 manager + 5 agents) = **12 users**
  - 3 agencies × (1 admin + 5 agents) = **18 users**

List available users:

```bash
cd backend
npm run seed:users
# or
node scripts/seed_agency_mock_data.js --list-users
```

## Quick start

Seed everything (managers first, then agencies):

```bash
cd backend
npm run seed:ops
```

Dry run (no writes):

```bash
npm run seed:ops:dry
```

Reset all ops mock data:

```bash
npm run seed:ops:reset
```

## Individual scripts

| Command | Description |
|---------|-------------|
| `npm run seed:ops` | Unified agency + manager seed |
| `npm run seed:agency` | Agencies only (3 tenants, incl. 1 suspended) |
| `npm run seed:manager` | Manager teams only (2 teams) |
| `npm run seed:agency:reset` | Remove mock agencies + unassign members |
| `npm run seed:manager:reset` | Demote mock managers + clear rosters |

### Options (pass through to child scripts)

| Flag | Default | Description |
|------|---------|-------------|
| `--agents-per-agency` | 5 | Agency agents per tenant |
| `--agents-per-team` | 5 | Roster size per manager |
| `--logs-per-agent` | 40 | Call logs per agent |
| `--log-days` | 30 | Date window for logs (weighted to last 7d) |
| `--wallet-dollars` | 500 | Wallet credit per agent |
| `--reset-logs` | off | Delete existing ops mock logs before re-seed |
| `--dry-run` | off | Print actions without writing |
| `--agencies-only` | off | `seed:ops` skips managers |
| `--managers-only` | off | `seed:ops` skips agencies |

## What gets seeded

### Agencies (`seed_agency_mock_data.js`)

| ID | Name | Status |
|----|------|--------|
| `mock-acme-agency` | Acme Call Center (Mock) | active |
| `mock-summit-agency` | Summit Partners (Mock) | active |
| `mock-coastal-agency` | Coastal Insurance Group (Mock) | suspended |

Per active agency: locked campaigns, DIDs, `agency_admin` + agents, wallet credits, call logs with dispositions and recordings.

### Manager teams (`seed_manager_mock_data.js`)

| Team name | Roster |
|-----------|--------|
| Alpha Sales Team | 5 platform agents |
| Bravo Performance Team | 5 platform agents |

Each team: `role: manager`, `teamName`, `managedAgents`, call logs on platform campaigns.

### Call log quality (`scripts/lib/mockCallLogHelpers.js`)

- 30-day spread (heavier in last 7 days for default dashboard range)
- Tiered per-agent performance (high / mid / low) for leaderboard variety
- Dispositions: `sold`, `callback`, `not_interested`, `busy`, `dead_air`, `policy_closed`
- Billable calls with cost from campaign pricing
- ~70% of billable calls include recording URLs
- Deterministic `callSid` prefix `CA_OPS_MOCK_*` for idempotent re-runs

## Verification

1. Log in as **platform admin**
2. Open **Agencies** → `/app/admin/ops/agencies`
   - Select `mock-acme-agency` or `mock-summit-agency`
   - Confirm KPI strip, earnings trend, top agents, leaderboard, drilldown, call logs
   - `mock-coastal-agency` should show **Suspended** in directory
3. Open **Manager Teams** → `/app/admin/ops/teams`
   - Select Alpha or Bravo team
   - Confirm team KPIs, billable/answer gauges, campaign mix chart, perf table, drilldown, logs
4. Try **7d** and **30d** range presets — charts should stay populated

**Note:** Live ops (online agents / in-call grid) is intentionally **not** seeded. Those sections may show 0 online; all historical analytics should be full.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "only N platform user(s) available" | Add more Firestore users or lower `--agents-per-agency` / `--agents-per-team` |
| Empty charts after seed | Check date range; logs are weighted to last 7 days |
| Seed appears stuck | Re-run with latest scripts — logs now use batched writes (fast) |
| Manager team empty in admin ops | Run `npm run seed:manager` or full `npm run seed:ops` |
| Duplicate logs on re-run | Use `--reset-logs` or `npm run seed:ops:reset` then re-seed |
