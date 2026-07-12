// Tracks recent DB errors in a rolling 10s window.
// If more than 5 errors occur in that window, the breaker "opens" —
// callers should check isOpen() before hitting the DB and back off if true.

const WINDOW_MS = 10_000;
const ERROR_THRESHOLD = 5;
const COOLDOWN_MS = 15_000; // how long breaker stays open before allowing a retry attempt

let errorTimestamps = [];
let openedAt = null;

function recordError() {
  const now = Date.now();
  errorTimestamps.push(now);
  errorTimestamps = errorTimestamps.filter((t) => now - t <= WINDOW_MS);

  if (errorTimestamps.length > ERROR_THRESHOLD && !openedAt) {
    openedAt = now;
    console.error(`🔴 Circuit breaker OPEN — ${errorTimestamps.length} DB errors in last ${WINDOW_MS}ms`);
  }
}

function recordSuccess() {
  // A success while half-open (past cooldown) closes the breaker again
  if (openedAt && Date.now() - openedAt > COOLDOWN_MS) {
    console.log('🟢 Circuit breaker CLOSED — DB appears recovered');
    openedAt = null;
    errorTimestamps = [];
  }
}

function isOpen() {
  if (!openedAt) return false;
  // allow a half-open "test" attempt after cooldown
  if (Date.now() - openedAt > COOLDOWN_MS) return false;
  return true;
}

module.exports = { recordError, recordSuccess, isOpen };