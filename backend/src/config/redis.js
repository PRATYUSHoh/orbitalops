// Redis client configuration with in-memory fallback.
// In AI Studio environment without external Redis, provides in-memory Map stub
// per Phase 2.2 of the web migration reference.

const Redis = require('ioredis');
const { getRedisConnection } = require('./redisConnection');

const store = new Map();
const inMemoryRedis = {
  get: async (k) => store.get(k) ?? null,
  set: async (k, v) => { store.set(k, v); return 'OK'; },
  del: async (k) => store.delete(k),
  incr: async (k) => {
    const n = (Number(store.get(k)) || 0) + 1;
    store.set(k, n);
    return n;
  },
  ping: async () => 'PONG',
  on: () => {},
  status: 'ready',
};

let client = null;

if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    const connConfig = getRedisConnection();
    client = new Redis({
      ...connConfig,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: () => null, // don't loop endlessly if unreachable
    });

    client.on('error', (err) => {
      console.warn('[redis] Redis connection failed, continuing with in-memory mock:', err.message);
    });
  } catch (err) {
    console.warn('[redis] Failed to init Redis client, using in-memory mock:', err.message);
    client = null;
  }
}

const redis = new Proxy(inMemoryRedis, {
  get: (target, prop) => {
    if (client && client.status === 'ready' && typeof client[prop] === 'function') {
      return (...args) => client[prop](...args).catch(() => target[prop]?.(...args));
    }
    return target[prop];
  },
});

module.exports = redis;