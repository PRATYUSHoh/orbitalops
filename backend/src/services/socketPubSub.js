// The worker and the app run in SEPARATE processes/containers, so the worker
// can't directly call io.emit() — there's no shared Socket.io instance across
// processes. Instead: worker PUBLISHES to a Redis channel, app SUBSCRIBES to
// that channel and re-broadcasts to connected browser clients via Socket.io.
// This is the same pattern as the multi-process Prometheus metrics fix.

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const CHANNEL = 'telemetry_processed';

function createPublisher() {
  const pub = new Redis(REDIS_URL);
  return {
    publish: (payload) => pub.publish(CHANNEL, JSON.stringify(payload)),
  };
}

function createSubscriber(onMessage) {
  const sub = new Redis(REDIS_URL);
  sub.subscribe(CHANNEL, (err) => {
    if (err) console.error('[socketPubSub] Failed to subscribe:', err.message);
    else console.log(`[socketPubSub] Subscribed to ${CHANNEL}`);
  });
  sub.on('message', (channel, message) => {
    if (channel === CHANNEL) {
      try {
        onMessage(JSON.parse(message));
      } catch (err) {
        console.error('[socketPubSub] Failed to parse message:', err.message);
      }
    }
  });
  return sub;
}

module.exports = { CHANNEL, createPublisher, createSubscriber };