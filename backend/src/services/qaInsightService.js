const DEFAULT_MODEL = 'gemini-2.5-flash';

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

module.exports = {
  generateQaInsight,
};

