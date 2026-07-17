/**
 * Side panel showing a single satellite's live health data, fetched from
 * GET /api/satellites/:id/health on click. Pure DOM, no framework — mirrors
 * overlay.js's approach so the whole frontend stays consistently vanilla.
 */

let panelEl = null;

function ensurePanel() {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.id = 'detail-panel';
  panelEl.className = 'detail-panel hidden';
  document.getElementById('app').appendChild(panelEl);
  return panelEl;
}

export function hideDetailPanel() {
  const el = ensurePanel();
  el.classList.add('hidden');
}

export function showLoading(satelliteId) {
  const el = ensurePanel();
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="panel-header">
      <span>Satellite #${satelliteId}</span>
      <button class="panel-close" id="panel-close-btn">✕</button>
    </div>
    <div class="panel-body panel-loading">Loading…</div>
  `;
  document.getElementById('panel-close-btn').onclick = hideDetailPanel;
}

export function showError(satelliteId, message) {
  const el = ensurePanel();
  el.innerHTML = `
    <div class="panel-header">
      <span>Satellite #${satelliteId}</span>
      <button class="panel-close" id="panel-close-btn">✕</button>
    </div>
    <div class="panel-body panel-error">Failed to load: ${message}</div>
  `;
  document.getElementById('panel-close-btn').onclick = hideDetailPanel;
}

/**
 * Renders the actual GET /api/satellites/:id/health response shape:
 * { satellite, latest_telemetry, last_seen, job_status_counts, recent_alerts }
 */
export function showSatelliteDetail(data) {
  const el = ensurePanel();
  const { satellite, latest_telemetry, last_seen, recent_alerts } = data;

  const telemetryHtml = latest_telemetry
    ? `
      <div class="panel-row"><span>Temperature</span><b>${latest_telemetry.temperature}°C</b></div>
      <div class="panel-row"><span>Battery</span><b>${latest_telemetry.battery}%</b></div>
      <div class="panel-row"><span>Signal</span><b>${latest_telemetry.signal_strength} dBm</b></div>
    `
    : `<div class="panel-row panel-muted">No telemetry recorded yet</div>`;

  const alertsHtml = recent_alerts && recent_alerts.length
    ? recent_alerts
        .slice(0, 5)
        .map(
          (a) => `<div class="panel-alert">${a.type} — ${new Date(a.triggered_at).toLocaleString()}</div>`
        )
        .join('')
    : `<div class="panel-row panel-muted">No recent alerts</div>`;

  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="panel-header">
      <span>${satellite.name} <span class="panel-id">#${satellite.id}</span></span>
      <button class="panel-close" id="panel-close-btn">✕</button>
    </div>
    <div class="panel-body">
      <div class="panel-row"><span>Orbit type</span><b>${satellite.orbit_type}</b></div>
      <div class="panel-row"><span>Last seen</span><b>${last_seen ? new Date(last_seen).toLocaleString() : 'never'}</b></div>
      <div class="panel-section-title">Latest telemetry</div>
      ${telemetryHtml}
      <div class="panel-section-title">Recent alerts</div>
      ${alertsHtml}
    </div>
  `;
  document.getElementById('panel-close-btn').onclick = hideDetailPanel;
}
