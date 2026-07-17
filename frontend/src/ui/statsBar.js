/**
 * Small always-visible stats summary — active anomaly count, pulled from
 * GET /api/alerts. Polled on an interval rather than tied to Socket.io
 * events, so the count is correct even right after page load, before any
 * live event has arrived.
 */

let barEl = null;

function ensureBar() {
  if (barEl) return barEl;
  barEl = document.createElement('div');
  barEl.id = 'stats-bar';
  barEl.className = 'stats-bar';
  barEl.innerHTML = `
    <span class="stats-item"><b id="stats-anomaly-count">0</b> active anomalies</span>
  `;
  document.getElementById('app').appendChild(barEl);
  return barEl;
}

export async function refreshStats(apiBaseUrl) {
  ensureBar();
  try {
    const res = await fetch(`${apiBaseUrl}/api/alerts?limit=100`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    // Real shape from alert.controller.js: { alerts: [...], limit, offset }
    const count = data.alerts?.length ?? 0;
    document.getElementById('stats-anomaly-count').textContent = count;
  } catch (err) {
    console.warn('[statsBar] failed to refresh', err);
  }
}

export function startStatsPolling(apiBaseUrl, intervalMs = 15000) {
  ensureBar();
  refreshStats(apiBaseUrl);
  setInterval(() => refreshStats(apiBaseUrl), intervalMs);
}
