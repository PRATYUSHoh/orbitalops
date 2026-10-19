/**
 * Real-time stats summary — active anomaly count derived from satellites currently in an anomaly state.
 * Directly updates the unified top Mission Control navigation bar.
 */

export async function refreshStats(apiBaseUrl) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/satellites`);
    if (!res.ok) throw new Error(`${res.status}`);
    const satellites = await res.json();
    const count = satellites.filter(s => s.status === 'anomaly').length;

    const countEl = document.getElementById('stats-anomaly-count');
    const pillEl = document.getElementById('stats-anomaly-pill');

    if (countEl) {
      countEl.textContent = count;
    }
    if (pillEl) {
      if (count > 0) {
        pillEl.classList.add('has-active-anomaly');
      } else {
        pillEl.classList.remove('has-active-anomaly');
      }
    }
  } catch (err) {
    console.warn('[statsBar] failed to refresh', err);
  }
}

export function startStatsPolling(apiBaseUrl, intervalMs = 5000) {
  refreshStats(apiBaseUrl);
  setInterval(() => refreshStats(apiBaseUrl), intervalMs);
}
