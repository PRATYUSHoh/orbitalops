/**
 * Scrolling feed of recent telemetry_processed events. Exists because a
 * flashing dot on a spinning globe is easy to miss — especially in a screen
 * recording — while a text log makes the real-time pipeline unambiguous.
 * Keeps only the last MAX_ENTRIES, newest on top, with a self-updating
 * "Xs ago" timestamp per entry (no external date library needed for this).
 */

const MAX_ENTRIES = 8;
let listEl = null;
const entries = []; // { id, timestamp, el }

function ensureTicker() {
  if (listEl) return listEl;
  const container = document.createElement('div');
  container.id = 'event-ticker';
  container.className = 'event-ticker';
  container.innerHTML = `<div class="ticker-title">LIVE EVENTS</div><div class="ticker-list" id="ticker-list"></div>`;
  document.getElementById('app').appendChild(container);
  listEl = document.getElementById('ticker-list');

  // Refresh all "Xs ago" labels once a second, independent of new events.
  setInterval(refreshTimestamps, 1000);

  return listEl;
}

function refreshTimestamps() {
  const now = Date.now();
  entries.forEach(({ timestamp, el }) => {
    const secondsAgo = Math.max(0, Math.round((now - timestamp) / 1000));
    const timeEl = el.querySelector('.ticker-time');
    if (timeEl) timeEl.textContent = secondsAgo === 0 ? 'now' : `${secondsAgo}s ago`;
  });
}

/**
 * @param {{ name: string, satelliteId: number, isAnomaly: boolean }} event
 */
export function addTickerEvent({ name, satelliteId, isAnomaly }) {
  const list = ensureTicker();

  const row = document.createElement('div');
  row.className = `ticker-row ${isAnomaly ? 'ticker-anomaly' : 'ticker-normal'}`;
  row.innerHTML = `
    <span class="ticker-dot"></span>
    <span class="ticker-label">${name || `Sat #${satelliteId}`}</span>
    <span class="ticker-status">${isAnomaly ? 'ANOMALY' : 'normal'}</span>
    <span class="ticker-time">now</span>
  `;

  list.prepend(row);
  entries.unshift({ timestamp: Date.now(), el: row });

  // Trim old entries — both from the DOM and our tracking array.
  while (entries.length > MAX_ENTRIES) {
    const removed = entries.pop();
    removed.el.remove();
  }
}
