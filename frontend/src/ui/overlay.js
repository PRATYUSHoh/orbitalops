/**
 * Builds the unified Mission Control HUD top navigation bar:
 * Brand, live UTC mission clock, constellation telemetry status,
 * Grafana & Prometheus links, and orbital legend.
 */

let clockInterval = null;

export function renderOverlay(hudEl, { satelliteCount }) {
  hudEl.innerHTML = `
    <header class="hud-navbar">
      <!-- Left: Brand & Mission Clock -->
      <div class="hud-nav-left">
        <div class="hud-brand">
          <span class="hud-radar-dot"></span>
          <span class="hud-brand-title">ORBITAL<span>OPS</span></span>
        </div>
        <div class="hud-nav-divider"></div>
        <div class="hud-mission-info">
          <span class="hud-sub">MISSION CONTROL // TELEMETRY PIPELINE</span>
          <span id="hud-utc-clock" class="hud-clock">UTC --:--:--</span>
        </div>
      </div>

      <!-- Center: Constellation Metrics -->
      <div class="hud-nav-center">
        <div class="hud-pill">
          <span class="hud-pill-label">CONSTELLATION</span>
          <span class="hud-pill-value"><b id="hud-sat-count">${satelliteCount}</b> IN ORBIT</span>
        </div>
        <div id="stats-anomaly-pill" class="hud-pill hud-pill-anomaly">
          <span class="hud-pill-label">ANOMALIES</span>
          <span class="hud-pill-value"><b id="stats-anomaly-count">0</b> ACTIVE</span>
        </div>
        <div class="hud-pill">
          <span class="hud-pill-label">UPLINK</span>
          <span id="connection-status" class="hud-link-status live">● LIVE LINK</span>
        </div>
      </div>

      <!-- Right: Observability & Incident Actions -->
      <div class="hud-nav-right">
        <button id="open-grafana-btn" class="hud-action-btn grafana-btn">
          <span>📈</span> Grafana Dashboard
        </button>
        <a href="/metrics" target="_blank" class="hud-action-btn prom-btn">
          <span>📊</span> Prometheus /metrics ↗
        </a>
      </div>
    </header>

    <!-- Bottom HUD Bar: Legend & Coordinate Status -->
    <footer class="hud-bottom-bar">
      <div class="hud-legend">
        <span class="legend-title">TELEMETRY STATUS:</span>
        <span class="legend-item"><span class="legend-dot normal"></span>NOMINAL (HEALTHY)</span>
        <span class="legend-item"><span class="legend-dot anomaly"></span>ANOMALY DETECTED</span>
      </div>
      <div class="hud-orbit-meta">
        <span>ORBITS: LEO &bull; MEO &bull; GEO &bull; SSO</span>
        <span style="opacity: 0.5;">|</span>
        <span>LATENCY: &lt;15ms</span>
      </div>
    </footer>
  `;

  // Start UTC Mission Clock
  function updateClock() {
    const clockEl = document.getElementById('hud-utc-clock');
    if (clockEl) {
      const d = new Date();
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      const secs = String(d.getUTCSeconds()).padStart(2, '0');
      clockEl.textContent = `UTC ${hours}:${mins}:${secs}`;
    }
  }

  if (clockInterval) clearInterval(clockInterval);
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}
