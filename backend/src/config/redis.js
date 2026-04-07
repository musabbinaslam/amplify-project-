require('dotenv').config();

// IN-MEMORY MOCK FOR LOCAL WINDOWS TESTING WITHOUT REDIS
const storage = new Map();
const sets = new Map();

const clientMock = {
    isOpen: true,
    connect: async () => console.log('✅ Connected to In-Memory Mock (No Local Redis Required)'),
    
    hSet: async (key, field, value) => {
        if (!storage.has(key)) storage.set(key, {});
        if (value === undefined) {
             // Hash map payload
             storage.set(key, { ...storage.get(key), ...field });
        } else {
             // Single field
             storage.get(key)[field] = value;
        }
        return 1;
    },
    
    get: async (key) => {
        return storage.has(key) ? storage.get(key) : null;
    },

    setEx: async (key, seconds, value) => {
        storage.set(key, value);
        // Simple mock: we just delete it after X seconds for testing
        setTimeout(() => storage.delete(key), seconds * 1000);
        return 'OK';
    },

    hGetAll: async (key) => {
        return storage.get(key) || null;
    },
    
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

const connectRedis = async () => {
    await clientMock.connect();
};

module.exports = {
    redisClient: clientMock,
    connectRedis
};
