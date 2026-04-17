require('dotenv').config();
const { createClient } = require('redis');

// ─── In-Memory Mock (used locally when no REDIS_URL is set) ────────────────
const storage = new Map();
const sets = new Map();

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
    hGetAll: async (key) => storage.get(key) || null,
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
    sMove: async (source, dest, member) => {
        if (!sets.has(source) || !sets.get(source).has(member)) return 0;
        sets.get(source).delete(member);
        if (!sets.has(dest)) sets.set(dest, new Set());
        sets.get(dest).add(member);
        return 1;
    },
    del: async (key) => {
        storage.delete(key);
        return 1;
    }
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
