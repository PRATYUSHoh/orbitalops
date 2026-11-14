// Hybrid Redis Pub/Sub + in-memory EventEmitter abstraction.
// Uses real Redis Pub/Sub (via ioredis) across containers when Redis is configured
// and reachable, and seamlessly falls back to an in-process EventEmitter when
// Redis is unconfigured or unreachable.

const EventEmitter = require('events');
const Redis = require('ioredis');
const { getRedisConnection, isRedisConfigured } = require('../config/redisConnection');
const redisClient = require('../config/redis');

const pubSubBus = new EventEmitter();
const CHANNEL = 'telemetry_processed';

function createRedisPubSubClient(role) {
  const connConfig = getRedisConnection();
  if (!connConfig) return null;

  const client = new Redis({
    ...connConfig,
    maxRetriesPerRequest: null,
    connectTimeout: 2000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
  });

  client.on('error', (err) => {
    console.warn(`[pubsub:${role}] Redis connection error, using local fallback:`, err.message);
  });

  return client;
}

function createPublisher() {
  let pubClient = null;
  let initStarted = false;

  async function ensurePubClient() {
    if (pubClient || initStarted || !isRedisConfigured()) return;
    initStarted = true;
    const ready = await redisClient.waitForRedisReady();
    if (ready) {
      pubClient = createRedisPubSubClient('pub');
    }
  }

  // Kick off background check if configured
  if (isRedisConfigured()) {
    ensurePubClient().catch(() => {});
  }

  return {
    publish: (payload) => {
      if (pubClient && pubClient.status === 'ready') {
        pubClient.publish(CHANNEL, JSON.stringify(payload)).catch(() => {
          pubSubBus.emit(CHANNEL, payload);
        });
        return;
      }
      // Fallback: local in-memory broadcast
      pubSubBus.emit(CHANNEL, payload);
    },
    close: async () => {
      if (pubClient) {
        try {
          await pubClient.quit();
        } catch (_) {
          pubClient.disconnect();
        }
        pubClient = null;
      }
    },
  };
}

function createSubscriber(onMessage) {
  pubSubBus.on(CHANNEL, onMessage);

  let subClient = null;
  let closed = false;

  if (isRedisConfigured()) {
    redisClient
      .waitForRedisReady()
      .then((ready) => {
        if (!ready || closed) return;
        subClient = createRedisPubSubClient('sub');
        if (!subClient) return;

        subClient.subscribe(CHANNEL, (err) => {
          if (err) {
            console.warn('[pubsub:sub] Subscribe failed, using local fallback:', err.message);
          } else {
            console.log(`[pubsub:sub] Subscribed to Redis channel "${CHANNEL}"`);
          }
        });

        subClient.on('message', (channel, message) => {
          if (channel !== CHANNEL) return;
          try {
            const payload = JSON.parse(message);
            onMessage(payload);
          } catch (err) {
            console.warn('[pubsub:sub] Failed to parse message:', err.message);
          }
        });
      })
      .catch(() => {});
  }

  return {
    unsubscribe: async () => {
      closed = true;
      pubSubBus.off(CHANNEL, onMessage);
      if (subClient) {
        try {
          await subClient.unsubscribe(CHANNEL);
          await subClient.quit();
        } catch (_) {
          subClient.disconnect();
        }
        subClient = null;
      }
    },
  };
}

module.exports = { CHANNEL, createPublisher, createSubscriber };