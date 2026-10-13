const crypto = require('crypto');
const { redisClient } = require('../config/redis');

const TTL_SEC = 14 * 24 * 3600;
const LIVE_TTL_SEC = 2 * 3600;
const MAX_EVENTS = 300;
const PING_DEDUPE_MS = 2000;
const TRIM_EVERY = 20;

const lastPingFp = new Map();
const writeCount = new Map();

function digitsOf(raw) {
  return String(raw || '')
    .replace(/^phone_number=/i, '')
    .replace(/\D/g, '');
}

function normalizePhone(raw) {
  const digits = digitsOf(raw);
  if (digits.length < 10) return { last10: null, e164: null, digits };
  const last10 = digits.slice(-10);
  return { last10, e164: `+1${last10}`, digits };
}

function parseQuery(q) {
  const raw = String(q || '').trim();
  if (!raw) return { kind: 'empty' };
  if (/^CA[0-9a-fA-F]{32}$/.test(raw)) {
    return { kind: 'sid', callSid: raw };
  }
  const phone = normalizePhone(raw);
  if (!phone.last10) return { kind: 'invalid', raw };
  return { kind: 'phone', ...phone, raw };
}

function phoneKey(last10) {
  return `calltrace:phone:${last10}`;
}

function sidKey(callSid) {
  return `calltrace:sid:${callSid}`;
}

function liveKey(last10) {
  return `calltrace:live:${last10}`;
}

function compactEvent(input = {}) {
  const phone = normalizePhone(input.phone);
  const event = {
    id: input.id || crypto.randomUUID(),
    at: Number(input.at) || Date.now(),
    type: String(input.type || 'event'),
  };
  if (phone.e164) event.phone = phone.e164;
  if (input.state) event.state = String(input.state);
  if (input.campaignId) event.campaignId = String(input.campaignId);
  if (input.agencyId) event.agencyId = String(input.agencyId);
  if (input.available !== undefined && input.available !== null) event.available = Boolean(input.available);
  if (input.to) event.to = String(input.to);
  if (input.agentId) event.agentId = String(input.agentId);
  if (input.callSid) event.callSid = String(input.callSid);
  if (input.detail) event.detail = String(input.detail).slice(0, 160);
  if (input.costCents != null) event.costCents = Number(input.costCents) || 0;
  if (input.reason) event.reason = String(input.reason);
  return { event, last10: phone.last10 };
}

function shouldDedupePing(last10, event) {
  if (event.type !== 'ping' || !last10) return false;
  const fp = `${event.campaignId || ''}|${event.available ? 1 : 0}|${event.state || ''}|${event.reason || ''}`;
  const prev = lastPingFp.get(last10);
  const now = event.at;
  if (prev && prev.fp === fp && now - prev.at < PING_DEDUPE_MS) return true;
  lastPingFp.set(last10, { fp, at: now });
  if (lastPingFp.size > 20_000) lastPingFp.clear();
  return false;
}

async function persist(event, last10) {
  if (!last10 && !event.callSid) return;
  const member = JSON.stringify(event);
  const score = event.at;
  if (last10) {
    const key = phoneKey(last10);
    await redisClient.zAdd(key, { score, value: member });
    await redisClient.expire(key, TTL_SEC);
    const n = (writeCount.get(last10) || 0) + 1;
    writeCount.set(last10, n);
    if (n % TRIM_EVERY === 0) {
      await redisClient.zRemRangeByRank(key, 0, -(MAX_EVENTS + 1));
    }
  }
  if (event.callSid && last10) {
    await redisClient.set(sidKey(event.callSid), last10, { EX: TTL_SEC });
  }
}

async function append(input) {
  try {
    const { event, last10 } = compactEvent(input);
    if (shouldDedupePing(last10, event)) return;
    await persist(event, last10);
  } catch (err) {
    console.warn('[callTrace] append failed:', err.message);
  }
}

function trace(input) {
  void append(input);
}

async function setLive(phone, payload = {}) {
  try {
    const { last10, e164 } = normalizePhone(phone);
    if (!last10) return;
    const body = JSON.stringify({
      agentId: payload.agentId || null,
      callSid: payload.callSid || null,
      campaignId: payload.campaignId || null,
      from: e164,
      to: payload.to || null,
      startedAt: payload.startedAt || new Date().toISOString(),
    });
    await redisClient.set(liveKey(last10), body, { EX: LIVE_TTL_SEC });
  } catch (err) {
    console.warn('[callTrace] setLive failed:', err.message);
  }
}

async function clearLive(phone) {
  try {
    const { last10 } = normalizePhone(phone);
    if (!last10) return;
    await redisClient.del(liveKey(last10));
  } catch (err) {
    console.warn('[callTrace] clearLive failed:', err.message);
  }
}

function setLiveSoon(phone, payload) {
  void setLive(phone, payload);
}

function clearLiveSoon(phone) {
  void clearLive(phone);
}

function parseMembers(members = []) {
  const out = [];
  members.forEach((raw) => {
    try {
      out.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch { /* skip */ }
  });
  return out;
}

async function getTimelineByLast10(last10) {
  if (!last10) return [];
  const members = await redisClient.zRange(phoneKey(last10), -MAX_EVENTS, -1);
  return parseMembers(members);
}

async function resolveSid(callSid) {
  if (!callSid) return null;
  return redisClient.get(sidKey(callSid));
}

async function getLive(last10) {
  if (!last10) return null;
  const raw = await redisClient.get(liveKey(last10));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  TTL_SEC,
  MAX_EVENTS,
  normalizePhone,
  parseQuery,
  append,
  trace,
  setLive,
  clearLive,
  setLiveSoon,
  clearLiveSoon,
  getTimelineByLast10,
  resolveSid,
  getLive,
};
