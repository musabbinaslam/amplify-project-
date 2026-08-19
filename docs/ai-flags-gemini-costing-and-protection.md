# AI Flags — Gemini Costing & API Protection

Guide for estimating client cost of the **AI Flags** feature and keeping the Gemini API from being overused.

> **Do not mix features.** This doc is about **AI Flags** (recording compliance / Gemini audio review).  
> The older **QA insight** (call-score) path is separate and is off by default (`QA_INSIGHT_GEMINI_ENABLED=false`).

---

## 1. What AI Flags spends money on

Each analyzed call sends the **Twilio MP3 + active compliance rules** to Gemini and gets back a transcript + violations JSON.

| Item | Default / notes |
| --- | --- |
| Model | `gemini-3.5-flash-lite` (`GEMINI_MODEL`) |
| Trigger paths | Live call completion, end-of-shift auto batch, Admin “Analyze older calls”, single/batch re-analyze |
| Duration cap | **None** (calls longer than 20 minutes are allowed) |
| Soft limit | Recording file ≈ **18 MB** max for inline upload |

Official rates (paid tier — verify on [Google AI pricing](https://ai.google.dev/gemini-api/docs/pricing)):

| Token type | Rate (USD) |
| --- | --- |
| Input (audio + prompt) | **$0.30 / 1M tokens** |
| Output (transcript + JSON) | **$2.50 / 1M tokens** |

The app estimates audio input as about **32 tokens per second** of call duration (logged as `Audio review tokens≈…`).

---

## 2. Cost formula

```text
audio_tokens  ≈ duration_sec × 32
prompt_tokens ≈ 500–2,000          (rules + instructions; usually small)
output_tokens ≈ 400–2,500+         (longer calls → longer transcripts)

cost_per_call ≈
  (audio_tokens + prompt_tokens) / 1_000_000 × 0.30
  + output_tokens / 1_000_000 × 2.50
```

Most of the bill is often **output** (transcript), not audio input.

### Rule of thumb (`gemini-3.5-flash-lite`, paid)

| Avg call length | Approx cost / analyzed call |
| --- | --- |
| ~1 min | **$0.003–0.006** |
| ~3 min | **$0.006–0.012** |
| ~5 min | **$0.01–0.02** |
| ~10 min | **$0.02–0.04** |
| 20+ min | Scales with duration + longer transcript |

### Monthly estimate

```text
monthly_gemini_cost ≈
  analyzed_calls_per_month
  × avg_cost_per_call
  × (1 + reanalyze_rate)   // Clear re-runs, retries
```

Examples at **~$0.01 per call** (typical short–medium calls):

| Volume | Gemini / month (ballpark) |
| --- | --- |
| 500 calls/day | ~**$150** |
| 1,000 calls/day | ~**$300** |
| 5,000 calls/day | ~**$1,500** |

Add **~10–30%** buffer for re-analyzes, auto-shift retries, and longer calls.

### Sanity check from logs

When a review runs:

```text
[QA] Audio review tokens≈1792 duration=56s bytes=…
```

Example: ~1.8k audio tokens → input ≈ **$0.0005**, plus a few cents of output → usually **under $0.01** for that call.

---

## 3. What is *not* in the Gemini number

- Twilio recording storage / fetch (usually tiny vs Gemini)
- App server / Redis cost (negligible per call)
- Human time reviewing Pending flags in Admin / QA
- Free-tier Gemini limits — **production needs a paid key with billing**

---

## 4. How to quote a client

1. Ask for **calls/day** and **average duration**.
2. Decide scope: **all** recordings vs sample / end-of-shift only.
3. Price options:
   - **Pass-through:** actual Google usage + **20–40%** margin  
   - **Flat:** e.g. `$X per 1,000 analyzed calls` from the table above  
4. Note re-analyze is paid again; keep “Re-analyze from Clear” off by default in ops.

---

## 5. How the API gets abused (and by what)

Gemini is burned by **your jobs**, not by the model “calling itself”:

1. Admins spam **Analyze older calls** / **Re-analyze**
2. **End-of-shift auto batch** queues many unscored calls when the floor goes idle
3. **Live completion** dispatches a review per finished call
4. **Retries** on quota errors can multiply requests
5. Without a **Google spend cap**, the key keeps charging until billing stops it

---

## 6. Protections already in the app (AI Flags)

| Guard | Behavior |
| --- | --- |
| Job lock | Only one AI Flags batch runs at a time |
| Claim + skip | Same call isn’t scored twice unless force re-analyze |
| Skip junk | Mock calls, failed statuses, missing recordings, already reviewed |
| File size | Skip if recording exceeds inline size limit |
| Retries | Max ~3 attempts; stop early on billing errors |
| Auto-shift batch | Default max **40** per idle trigger (`QA_AUTO_BATCH_LIMIT`) |
| Auth | Analyze / re-analyze only on admin / QA routes |
| Feature split | QA insight Gemini is separate and **off** by default |

---

## 7. Recommendations (do these)

### A. Cap spend at Google (most important)

In [Google Cloud Billing](https://console.cloud.google.com/billing) / AI Studio:

- Set **budget alerts** (e.g. $50 / $100 / month)
- Prefer a **hard spend cap** or prepaid credits so the key dies instead of running away
- Use a **dedicated Gemini API key** for this product (revoke = instant kill switch)

### B. Env knobs (`backend/.env`)

```bash
# AI Flags (recording compliance) — keep on for production
AI_FLAGS_GEMINI_ENABLED=true

# Old QA insight / call-score — keep off unless you intentionally need it
QA_INSIGHT_GEMINI_ENABLED=false

GEMINI_MODEL=gemini-3.5-flash-lite

# End-of-shift auto analyze
QA_AUTO_SHIFT_ENABLED=true
QA_AUTO_BATCH_LIMIT=10          # lower than 40 while ramping
QA_AUTO_SHIFT_IDLE_MS=300000
QA_SHIFT_TIMEZONE=America/New_York
```

To pause **only AI Flags** without touching other Gemini uses (e.g. support chat):

```bash
AI_FLAGS_GEMINI_ENABLED=false
```

Then restart the backend.

### C. Operational rules

- Don’t leave **Re-analyze from Clear** on casually
- While testing: analyze **1–3** calls at a time; prefer short filters
- For long production calls: use **Any length** / live / auto-shift — there is no 20-minute duration reject
- Treat every re-analyze as a new paid Gemini call

### D. Optional app-level budget (not built yet — recommended later)

If Google’s billing cap isn’t enough:

- Daily max **analyzed calls** (Redis counter)
- Daily **$ estimate** using `duration × 32` tokens before each Gemini call
- Per-admin rate limit on backfill / reanalyze endpoints

Until then, **Google budget + env kill switch** is the real safety net.

---

## 8. Feature split cheat sheet

| Feature | Env | Default | Uses Gemini for |
| --- | --- | --- | --- |
| **AI Flags** | `AI_FLAGS_GEMINI_ENABLED` | **on** | Listening to recordings + compliance rules |
| **QA insight** | `QA_INSIGHT_GEMINI_ENABLED` | **off** | Old call-score / insight JSON |
| Support chat | (shared `GEMINI_API_KEY`) | depends on product | Unrelated to AI Flags costing above |

---

## 9. Quick client one-liner

> AI Flags costs roughly **$0.01 per analyzed call** on Gemini 3.5 Flash-Lite for typical short–medium calls; longer calls cost more. Cap Google spend, keep re-analyze rare, and lower `QA_AUTO_BATCH_LIMIT` until volume is known.

---

*Rates change — always re-check [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) before locking a client quote.*
