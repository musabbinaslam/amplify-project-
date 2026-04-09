require('dotenv').config();
const Redis = require('ioredis');

// Shared connection config for BullMQ queues
const connectionConfig = process.env.REDIS_URL ? 
    process.env.REDIS_URL : 
    { host: '127.0.0.1', port: 6379 };

const ioredisConnection = new Redis(connectionConfig, {
    maxRetriesPerRequest: null, // Critical requirement for BullMQ
    tls: (process.env.REDIS_URL && process.env.REDIS_URL.startsWith('rediss://')) ? { rejectUnauthorized: false } : undefined,
});

ioredisConnection.on('error', (err) => {
    console.error('[BullMQ Redis] Connection Error:', err.message);
});

ioredisConnection.on('ready', () => {
    console.log('✅ Connected to Upstash/Local Redis for BullMQ Queue Broker');
});

module.exports = {
    ioredisConnection
};
