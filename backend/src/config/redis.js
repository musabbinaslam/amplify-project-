require('dotenv').config();
const { createClient } = require('redis');

// ─── In-Memory Mock (used locally when no REDIS_URL is set) ────────────────
const storage = new Map();
const sets = new Map();
const sortedSets = new Map(); // key → Map<member, score>

function getSortedSet(key) {
    if (!sortedSets.has(key)) sortedSets.set(key, new Map());
    return sortedSets.get(key);
}

const clientMock = {
    isOpen: true,
    connect: async () => console.log('✅ Connected to In-Memory Mock (No Local Redis Required)'),
    hSet: async (key, field, value) => {
        if (!storage.has(key)) storage.set(key, {});
        if (value === undefined) {
             storage.set(key, { ...storage.get(key), ...field });
        } else {
             storage.get(key)[field] = value;
        }
        return 1;
    },
    get: async (key) => storage.has(key) ? storage.get(key) : null,
    setEx: async (key, seconds, value) => {
        storage.set(key, value);
        setTimeout(() => storage.delete(key), seconds * 1000);
        return 'OK';
    },
    exists: async (key) => storage.has(key) ? 1 : 0,
    hGetAll: async (key) => storage.get(key) || null,
    del: async (key) => {
        storage.delete(key);
        return 1;
    },
    // ── Regular Sets ────────────────────────────────────────────────────────
    sAdd: async (key, value) => {
        if (!sets.has(key)) sets.set(key, new Set());
        sets.get(key).add(value);
        return 1;
    },
    sRem: async (key, value) => {
        if (!sets.has(key)) return 0;
        sets.get(key).delete(value);
        return 1;
    },
    sMembers: async (key) => {
        if (!sets.has(key)) return [];
        return Array.from(sets.get(key));
    },
    sCard: async (key) => {
        if (!sets.has(key)) return 0;
        return sets.get(key).size;
    },
    // ── Sorted Sets ─────────────────────────────────────────────────────────
    // zAdd(key, { score, value }) — adds/updates a member with a score
    zAdd: async (key, { score, value }) => {
        const ss = getSortedSet(key);
        const isNew = !ss.has(value);
        ss.set(value, score);
        return isNew ? 1 : 0;
    },
    // zRem(key, member) — removes a member; returns 1 if found, 0 if not
    // This is the ATOMIC LOCK — two concurrent callers can't both get 1
    zRem: async (key, member) => {
        const ss = getSortedSet(key);
        if (!ss.has(member)) return 0;
        ss.delete(member);
        return 1;
    },
    // zRange(key, start, stop) — returns members sorted by score ascending
    zRange: async (key, start, stop) => {
        const ss = getSortedSet(key);
        const sorted = [...ss.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
        const end = stop === -1 ? sorted.length : stop + 1;
        return sorted.slice(start, end);
    },
    // zCard(key) — count of members
    zCard: async (key) => {
        return getSortedSet(key).size;
    },
    // ── Key Scan (for activecall:* pattern iteration) ────────────────────────
    // Mimics Redis SCAN with a MATCH pattern. Only supports prefix* style patterns.
    // Used by listActiveCalls() and findAgentIdByCallSid().
    scanIterator: async function* ({ MATCH = '*', COUNT = 100 } = {}) {
        const isWildcard = MATCH.endsWith('*');
        const prefix     = isWildcard ? MATCH.slice(0, -1) : MATCH;
        for (const key of storage.keys()) {
            if (isWildcard ? key.startsWith(prefix) : key === MATCH) {
                yield key;
            }
        }
    },
};

// ─── Real Redis Client (Upstash in production) ─────────────────────────────
let redisClient = clientMock;

const connectRedis = async () => {
    if (process.env.REDIS_URL) {
        try {
            const client = createClient({
                url: process.env.REDIS_URL,
                socket: {
                    tls: process.env.REDIS_URL.startsWith('rediss://'),
                    keepAlive: 60000,      // Send keepalive every 60s to prevent Upstash idle disconnects (was 10s — reduced 6× to save commands)
                    noDelay: true,
                    reconnectStrategy: (retries) => {
                        if (retries > 20) {
                            console.error('[Redis] Too many reconnect attempts, giving up.');
                            return new Error('Max reconnect attempts reached');
                        }
                        return Math.min(retries * 200, 5000);
                    }
                }
            });

            client.on('error', (err) => {
                // Don't crash the process on connection resets — just let reconnectStrategy handle it
                console.error('[Redis] Error:', err.message);
            });
            client.on('reconnecting', () => console.log('[Redis] Reconnecting to Upstash...'));
            client.on('ready', () => console.log('✅ Upstash Redis ready'));

            await client.connect();
            console.log('✅ Connected to Upstash Redis');
            redisClient = client;
        } catch (err) {
            console.error('[Redis] Failed to connect to Upstash, falling back to mock:', err.message);
            await clientMock.connect();
        }
    } else {
        // Local dev — use in-memory mock
        await clientMock.connect();
    }
};

module.exports = { redisClient: new Proxy({}, {
    get: (_, prop) => (...args) => redisClient[prop](...args)
}), connectRedis };
