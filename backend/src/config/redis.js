// Redis client configuration with in-memory fallback.
// Connects to real Redis via ioredis when REDIS_URL (redis:// or rediss://)
// or REDIS_HOST is configured and reachable; otherwise seamlessly falls back
// to an in-memory Map stub.

const Redis = require('ioredis');
const { getRedisConnection, isRedisConfigured } = require('./redisConnection');

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
let readyPromise = Promise.resolve(false);

if (isRedisConfigured()) {
  try {
    const connConfig = getRedisConnection();
    client = new Redis({
      ...connConfig,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: () => null, // don't loop endlessly if unreachable
    });

    readyPromise = new Promise((resolve) => {
      const onReady = () => {
        cleanup();
        resolve(true);
      };
      const onFail = () => {
        cleanup();
        resolve(false);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(client?.status === 'ready');
      }, 1500);

      function cleanup() {
        clearTimeout(timer);
        client?.off('ready', onReady);
        client?.off('error', onFail);
        client?.off('end', onFail);
      }

      client.once('ready', onReady);
      client.once('error', onFail);
      client.once('end', onFail);
    });

    client.on('error', (err) => {
      console.warn('[redis] Redis connection failed, continuing with in-memory mock:', err.message);
    });
  } catch (err) {
    console.warn('[redis] Failed to init Redis client, using in-memory mock:', err.message);
    client = null;
  }
}

async function waitForRedisReady() {
  if (!client) return false;
  if (client.status === 'ready') return true;
  if (client.status === 'end' || client.status === 'close') return false;
  return readyPromise;
}

function isRedisReady() {
  return Boolean(client && client.status === 'ready');
}

const redis = new Proxy(inMemoryRedis, {
  get: (target, prop) => {
    if (prop === 'isRedisReady') return isRedisReady;
    if (prop === 'waitForRedisReady') return waitForRedisReady;
    if (client && client.status === 'ready' && typeof client[prop] === 'function') {
      return (...args) => client[prop](...args).catch(() => target[prop]?.(...args));
    }
    return target[prop];
  },
});

module.exports = redis;