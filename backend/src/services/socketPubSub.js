// In-memory / Redis pub-sub abstraction.
// When Redis is not available, uses an in-process EventEmitter so telemetry events
// immediately broadcast to connected Socket.io clients.

const EventEmitter = require('events');
const pubSubBus = new EventEmitter();
const CHANNEL = 'telemetry_processed';

function createPublisher() {
  return {
    publish: (payload) => {
      // Local in-memory broadcast
      pubSubBus.emit(CHANNEL, payload);
    },
  };
}

function createSubscriber(onMessage) {
  pubSubBus.on(CHANNEL, onMessage);
  return {
    unsubscribe: () => {
      pubSubBus.off(CHANNEL, onMessage);
    },
  };
}

module.exports = { CHANNEL, createPublisher, createSubscriber };