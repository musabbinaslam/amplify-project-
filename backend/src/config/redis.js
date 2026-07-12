require('dotenv').config();
const { createClient } = require('redis');

/** Namespace Redis keys per deploy (e.g. staging vs production). Set on staging when both share one Upstash DB. */
function getRedisKeyPrefix() {
    const raw = String(process.env.REDIS_KEY_PREFIX || '').trim();
    if (!raw) return '';
    return raw.endsWith(':') ? raw : `${raw}:`;
}

function prefixRedisKey(key, prefix) {
    if (!prefix || key == null || typeof key !== 'string') return key;
    return `${prefix}${key}`;
}

const REDIS_KEY_ARG_COMMANDS = new Set([
    'get', 'set', 'setEx', 'del', 'exists',
    'hGet', 'hGetAll', 'hSet', 'hDel', 'hKeys',
    'sAdd', 'sRem', 'sMembers', 'sCard', 'sIsMember',
    'zAdd', 'zRem', 'zRange', 'zCard', 'zScore', 'zRangeByScore', 'zRangeWithScores',
    'lPush', 'rPop', 'lLen', 'expire',
]);

function wrapRedisClient(client, prefix) {
    if (!prefix) return client;
    return new Proxy(client, {
        get(target, prop) {
            const orig = target[prop];
            if (typeof orig !== 'function') return orig;

            if (prop === 'scanIterator') {
                return async function* scanWithPrefix(opts = {}) {
                    const nextOpts = { ...opts };
                    if (nextOpts.MATCH) {
                        nextOpts.MATCH = prefixRedisKey(nextOpts.MATCH, prefix);
                    }
                    yield* target.scanIterator(nextOpts);
                };
            }

            if (!REDIS_KEY_ARG_COMMANDS.has(prop)) {
                return orig.bind(target);
            }

            return (...args) => {
                if (args.length > 0) args[0] = prefixRedisKey(args[0], prefix);
                return orig.apply(target, args);
            };
        },
    });
}

function applyRedisKeyPrefix(client) {
    const prefix = getRedisKeyPrefix();
    if (!prefix) return client;
    console.log(`[Redis] Using key prefix "${prefix}" (staging/production isolation)`);
    return wrapRedisClient(client, prefix);
}

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
    set: async (key, value, options = {}) => {
        const nx = Boolean(options.NX);
        const ex = Number(options.EX);
        if (nx && storage.has(key)) return null;
        storage.set(key, value);
        if (Number.isFinite(ex) && ex > 0) {
            setTimeout(() => {
                if (storage.get(key) === value) storage.delete(key);
            }, ex * 1000);
        }
        return 'OK';
    },
    setEx: async (key, seconds, value) => {
        storage.set(key, value);
        setTimeout(() => storage.delete(key), seconds * 1000);
        return 'OK';
    },
    exists: async (key) => storage.has(key) ? 1 : 0,
    ping: async () => 'PONG',
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
    lPush: async (key, value) => {
        if (!storage.has(key)) storage.set(key, []);
        const list = storage.get(key);
        if (!Array.isArray(list)) storage.set(key, []);
        storage.get(key).unshift(value);
        return storage.get(key).length;
    },
    rPop: async (key) => {
        const list = storage.get(key);
        if (!Array.isArray(list) || !list.length) return null;
        return list.pop();
    },
    lLen: async (key) => {
        const list = storage.get(key);
        return Array.isArray(list) ? list.length : 0;
    },
    expire: async (key, seconds) => {
        setTimeout(() => storage.delete(key), seconds * 1000);
        return true;
    },
};

// ─── Real Redis Client (Upstash in production) ─────────────────────────────
let redisClient = applyRedisKeyPrefix(clientMock);

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
            redisClient = applyRedisKeyPrefix(client);
        } catch (err) {
            console.error('[Redis] Failed to connect to Upstash, falling back to mock:', err.message);
            await clientMock.connect();
            redisClient = applyRedisKeyPrefix(clientMock);
        }
    } else {
        // Local dev — use in-memory mock
        await clientMock.connect();
        redisClient = applyRedisKeyPrefix(clientMock);
    }
};

module.exports = {
    redisClient: new Proxy({}, {
        get: (_, prop) => (...args) => redisClient[prop](...args),
    }),
    connectRedis,
    getRedisKeyPrefix,
};
