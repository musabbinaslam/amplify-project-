const { fetchRecordingMp3Buffer } = require('./twilioRecordingService');
const { parseRecordingSid, isMockCallLog } = require('../utils/recordingSid');

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

function envFlagEnabled(name, defaultEnabled) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultEnabled;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

/**
 * Old QA call-score / insight Gemini path.
 * Off by default — separate from AI Flags audio review.
 */
function isQaInsightGeminiEnabled() {
  return envFlagEnabled('QA_INSIGHT_GEMINI_ENABLED', false);
}

/**
 * AI Flags (recording compliance audio review) Gemini path.
 * On by default. Independent from QA insight.
 */
function isAiFlagsGeminiEnabled() {
  return envFlagEnabled('AI_FLAGS_GEMINI_ENABLED', true);
}

class QaRetryableError extends Error {
  constructor(message, retryAfterMs = 8000, qaSource = 'quota') {
    super(message);
    this.name = 'QaRetryableError';
    this.retryAfterMs = retryAfterMs;
    this.qaSource = qaSource;
  }
}

function classifyGeminiError(message) {
  const text = String(message || '').toLowerCase();
  if (
    text.includes('prepayment')
    || text.includes('credits are depleted')
    || text.includes('billing#prepay')
  ) {
    return 'billing';
  }
  if (
    text.includes('quota')
    || text.includes('rate-limit')
    || text.includes('rate limit')
    || text.includes('resource exhausted')
    || text.includes('429')
  ) {
    return 'quota';
  }
  return 'fallback';
}

function parseRetryAfterMs(message) {
  const match = String(message || '').match(/retry in\s+([\d.]+)\s*s/i);
  const sec = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(sec) || sec <= 0) return 8000;
  return Math.min(Math.ceil(sec * 1000) + 750, 90_000);
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function safeJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_err) {
      return null;
    }
  }
}

function fallbackInsight(callMeta) {
  const isCompleted = callMeta.status === 'completed';
  const duration = Number(callMeta.duration || 0);
  const scoreBase = isCompleted ? 70 : 45;
  const durationAdj = clamp(Math.round(duration / 8), 0, 20);
  const score = clamp(scoreBase + durationAdj, 20, 95);
  const flags = [];
  if (!isCompleted) flags.push('call_not_completed');
  if (duration < 30) flags.push('very_short_call');
  if (!callMeta.isBillable) flags.push('non_billable_call');
  return {
    score,
    confidence: 0.45,
    flags,
    summary: isCompleted
      ? 'Completed call with moderate operational quality signal.'
      : 'Call did not complete; operational quality signal is weaker.',
    signals: {
      status: callMeta.status || 'unknown',
      durationSeconds: duration,
      billable: Boolean(callMeta.isBillable),
      campaign: callMeta.campaign || 'unknown',
      state: callMeta.state || null,
    },
    source: 'fallback',
    version: 'qa-v1',
  };
}

function normalizeInsight(raw, model) {
  const score = clamp(Number(raw?.score || 0), 0, 100);
  const confidence = clamp(Number(raw?.confidence || 0), 0, 1);
  const flags = Array.isArray(raw?.flags)
    ? raw.flags.map((f) => String(f).trim()).filter(Boolean).slice(0, 8)
    : [];
  const summary = String(raw?.summary || '').trim().slice(0, 240)
    || 'Operational quality signal generated.';
  const signals = raw?.signals && typeof raw.signals === 'object' ? raw.signals : {};
  return {
    score,
    confidence,
    flags,
    summary,
    signals,
    geminiModel: model,
    source: 'gemini',
    version: 'qa-v1',
  };
}

async function generateQaInsight(callMeta) {
  if (!isQaInsightGeminiEnabled()) {
    return fallbackInsight(callMeta);
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!apiKey || !String(apiKey).trim()) {
    return fallbackInsight(callMeta);
  }

  const systemInstruction = `
You generate operational QA insights for insurance call-center logs.
Return ONLY strict JSON with keys:
score (0-100 number), confidence (0-1 number), flags (string[]), summary (string), signals (object).
Do not include coaching tips, advice, training suggestions, or "how to improve" text.
Summary must be an operational observation only.
`;

  const prompt = {
    call: {
      callSid: callMeta.callSid || null,
      status: callMeta.status || 'unknown',
      durationSeconds: Number(callMeta.duration || 0),
      campaign: callMeta.campaign || 'unknown',
      campaignLabel: callMeta.campaignLabel || callMeta.campaign || 'unknown',
      billable: Boolean(callMeta.isBillable),
      cost: Number(callMeta.cost || 0),
      state: callMeta.state || null,
      from: callMeta.from || null,
      to: callMeta.to || null,
      createdAt: callMeta.createdAt || null,
    },
    allowedFlags: [
      'call_not_completed',
      'very_short_call',
      'non_billable_call',
      'high_cost_call',
      'quality_variance_risk',
      'missing_state_metadata',
    ],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(prompt) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || 'Gemini insight request failed');
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = safeJson(text);
    if (!parsed) {
      throw new Error('Gemini returned non-JSON insight payload');
    }
    return normalizeInsight(parsed, model);
  } catch (err) {
    console.warn('[QA] Falling back insight generation:', err.message);
    return fallbackInsight(callMeta);
  }
}

function normalizeAudioReview(raw, { model, rules, source = 'gemini_audio' } = {}) {
  const ruleMap = new Map((rules || []).map((r) => [r.id, r]));
  const violations = Array.isArray(raw?.violations)
    ? raw.violations.slice(0, 20).map((v) => {
        const ruleId = String(v?.ruleId || '').trim();
        const rule = ruleMap.get(ruleId);
        return {
          ruleId: ruleId || null,
          ruleName: rule?.name || String(v?.ruleName || '').trim() || 'Unknown rule',
          severity: rule?.severity || String(v?.severity || 'medium').trim() || 'medium',
          quote: String(v?.quote || '').trim().slice(0, 500),
          timestampSec: Number.isFinite(Number(v?.timestampSec)) ? Math.max(0, Math.round(Number(v.timestampSec))) : null,
          confidence: clamp(Number(v?.confidence || 0), 0, 1),
        };
      }).filter((v) => v.ruleId || v.quote)
    : [];

  return {
    status: violations.length ? 'pending_review' : 'clear',
    transcript: String(raw?.transcript || '').trim().slice(0, 20000),
    summary: String(raw?.summary || '').trim().slice(0, 400),
    violations,
    model: model || DEFAULT_MODEL,
    source,
    version: 'qa-audio-v1',
  };
}

function skippedAudioReview(source, summary) {
  return {
    status: 'clear',
    transcript: '',
    summary: summary || '',
    violations: [],
    model: DEFAULT_MODEL,
    source,
    version: 'qa-audio-v1',
  };
}

async function generateQaAudioReview(callMeta, rules = []) {
  if (!isAiFlagsGeminiEnabled()) {
    return skippedAudioReview('disabled', 'AI Flags Gemini is disabled (set AI_FLAGS_GEMINI_ENABLED=true to re-enable).');
  }
  const recordingSid = parseRecordingSid(callMeta.recordingSid || callMeta.recordingUrl);
  const duration = Number(callMeta.duration || 0);
  if (!recordingSid) {
    return skippedAudioReview('no_recording', 'No recording available for audio QA.');
  }
  if (isMockCallLog(callMeta)) {
    return skippedAudioReview('mock_call', 'Seeded/mock call logs have no real Twilio recording.');
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    return skippedAudioReview('no_rules', 'No active compliance rules for this campaign.');
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!apiKey || !String(apiKey).trim()) {
    return skippedAudioReview('fallback', 'Gemini API key missing; audio QA skipped.');
  }

  let audioBuffer;
  try {
    audioBuffer = await fetchRecordingMp3Buffer(recordingSid);
  } catch (err) {
    console.warn('[QA] Failed to fetch recording for audio review:', err.message);
    return skippedAudioReview('recording_fetch_failed', 'Could not download the call recording for analysis.');
  }

  if (!audioBuffer?.length) {
    return skippedAudioReview('recording_empty', 'Recording download was empty.');
  }
  if (audioBuffer.length > MAX_INLINE_BYTES) {
    return skippedAudioReview('recording_too_large', 'Recording file exceeds inline audio size limit.');
  }

  const estimatedAudioTokens = Math.round(Math.max(duration, 1) * 32);
  console.log(`[QA] Audio review tokens≈${estimatedAudioTokens} duration=${duration}s bytes=${audioBuffer.length} call=${callMeta.callSid || callMeta.id || 'unknown'}`);

  const systemInstruction = `
You are a compliance QA reviewer for insurance call-center recordings.
Listen to the full call audio. Identify the agent vs customer when possible.
Check ONLY the provided rules. Do not invent extra policy.
Return ONLY strict JSON with keys:
transcript (string — one speaker turn per line, formatted exactly like:
Agent: ...
Customer: ...
Agent: ...
Use a newline before every speaker label. Never put multiple "Agent:"/"Customer:" labels on the same line.),
summary (string, operational observation only, no coaching),
violations (array of { ruleId, ruleName, severity, quote, timestampSec, confidence }).
If a rule was followed, omit it from violations.
timestampSec is seconds from call start. confidence is 0-1.
`;

  const prompt = {
    call: {
      callSid: callMeta.callSid || null,
      campaign: callMeta.campaign || 'unknown',
      campaignLabel: callMeta.campaignLabel || callMeta.campaign || 'unknown',
      durationSeconds: duration,
      billable: Boolean(callMeta.isBillable),
    },
    rules: rules.map((r) => ({
      ruleId: r.id,
      name: r.name,
      severity: r.severity,
      instruction: r.instruction,
    })),
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/mpeg',
                data: audioBuffer.toString('base64'),
              },
            },
            { text: JSON.stringify(prompt) },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || 'Gemini audio review request failed';
      const kind = classifyGeminiError(msg);
      if (kind === 'billing') {
        return skippedAudioReview(
          'billing',
          'Gemini credits/billing are depleted. Add credits in Google AI Studio, then re-run Analyze older calls.',
        );
      }
      if (kind === 'quota' || res.status === 429) {
        throw new QaRetryableError(msg, parseRetryAfterMs(msg), 'quota');
      }
      throw new Error(msg);
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = safeJson(text);
    if (!parsed) {
      throw new Error('Gemini returned non-JSON audio review payload');
    }
    return normalizeAudioReview(parsed, { model, rules, source: 'gemini_audio' });
  } catch (err) {
    if (err instanceof QaRetryableError) throw err;
    const kind = classifyGeminiError(err.message);
    if (kind === 'billing') {
      return skippedAudioReview(
        'billing',
        'Gemini credits/billing are depleted. Add credits in Google AI Studio, then re-run Analyze older calls.',
      );
    }
    console.warn('[QA] Audio review falling back:', err.message);
    return skippedAudioReview(
      kind === 'quota' ? 'quota' : 'fallback',
      `Audio analysis failed: ${err.message}`,
    );
  }
}

module.exports = {
  generateQaInsight,
  generateQaAudioReview,
  classifyGeminiError,
  QaRetryableError,
  isQaInsightGeminiEnabled,
  isAiFlagsGeminiEnabled,
};

