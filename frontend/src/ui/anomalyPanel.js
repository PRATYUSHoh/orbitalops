/**
 * Anomaly Notification Panel — Scrollable HUD component tracking historical
 * and real-time anomaly incidents with timestamps, severity levels, and 3D focus.
 */

let panelEl = null;
let listEl = null;
let countBadgeEl = null;
const incidents = []; // Store incident objects

export function createAnomalyNotificationPanel({ apiBaseUrl = '', onInspectSatellite }) {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'anomaly-notification-panel';
  panelEl.className = 'anomaly-notification-panel';
  panelEl.innerHTML = `
    <div class="anomaly-panel-header">
      <div class="anomaly-header-title">
        <span class="anomaly-warning-icon">⚠️</span>
        <span>ANOMALY INCIDENTS</span>
        <span id="anomaly-badge-count" class="anomaly-badge">0</span>
      </div>
      <div class="anomaly-header-actions">
        <button id="anomaly-filter-btn" class="anomaly-filter-tag active" data-filter="all">ALL</button>
        <button class="anomaly-filter-tag" data-filter="critical">CRITICAL</button>
        <button id="anomaly-toggle-collapse" class="anomaly-collapse-btn" title="Minimize/Maximize">&minus;</button>
      </div>
    </div>
    <div class="anomaly-panel-body" id="anomaly-panel-body">
      <div id="anomaly-incidents-list" class="anomaly-incidents-list">
        <div class="anomaly-empty-state">Loading incident history...</div>
      </div>
    </div>
  `;

  const appEl = document.getElementById('app') || document.body;
  appEl.appendChild(panelEl);

  listEl = document.getElementById('anomaly-incidents-list');
  countBadgeEl = document.getElementById('anomaly-badge-count');

  // Collapse / Expand toggle
  const collapseBtn = document.getElementById('anomaly-toggle-collapse');
  const bodyEl = document.getElementById('anomaly-panel-body');
  let isCollapsed = false;

  collapseBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    bodyEl.style.display = isCollapsed ? 'none' : 'block';
    collapseBtn.innerHTML = isCollapsed ? '&#43;' : '&minus;';
    panelEl.classList.toggle('collapsed', isCollapsed);
  });

  // Filter buttons
  const filterBtns = panelEl.querySelectorAll('.anomaly-filter-tag');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderIncidents(btn.dataset.filter, onInspectSatellite);
    });
  });

  // Load historical alerts from the database
  loadInitialAlerts(apiBaseUrl, onInspectSatellite);

  // Refresh relative timestamps every 5 seconds
  setInterval(refreshTimestamps, 5000);

  return panelEl;
}

async function loadInitialAlerts(apiBaseUrl, onInspectSatellite) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/alerts?limit=50`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const alerts = data.alerts || [];

    // Also fetch satellite names for rich display
    let satNames = new Map();
    try {
      const satRes = await fetch(`${apiBaseUrl}/api/satellites`);
      if (satRes.ok) {
        const sats = await satRes.json();
        sats.forEach(s => satNames.set(s.id, s.name));
      }
    } catch (_) {}

    alerts.forEach(alert => {
      incidents.push({
        id: alert.id,
        satelliteId: alert.satellite_id,
        satelliteName: satNames.get(alert.satellite_id) || `Sat #${alert.satellite_id}`,
        type: alert.type,
        value: alert.value,
        threshold: alert.threshold,
        timestamp: new Date(alert.triggered_at).getTime(),
      });
    });

    renderIncidents('all', onInspectSatellite);
  } catch (err) {
    if (listEl) {
      listEl.innerHTML = `<div class="anomaly-empty-state">No recorded incidents yet.</div>`;
    }
  }
}

function getSeverity(type) {
  if (type === 'TEMP_CRITICAL' || type === 'BATTERY_LOW') {
    return { level: 'CRITICAL', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.4)' };
  }
  return { level: 'WARNING', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)' };
}

function formatViolation(type, value, threshold) {
  if (type === 'TEMP_CRITICAL') {
    return `🔥 Core temp ${value}°C (Threshold: >${threshold}°C)`;
  }
  if (type === 'BATTERY_LOW') {
    return `🪫 Power depletion ${value}% (Threshold: <${threshold}%)`;
  }
  if (type === 'SIGNAL_LOST') {
    return `📡 Signal blackout ${value} dBm (Threshold: <${threshold}dBm)`;
  }
  return `${type}: ${value}`;
}

function formatRelativeTime(timestamp) {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function renderIncidents(filter = 'all', onInspectSatellite) {
  if (!listEl) return;

  let filtered = incidents;
  if (filter === 'critical') {
    filtered = incidents.filter(i => i.type === 'TEMP_CRITICAL' || i.type === 'BATTERY_LOW');
  }

  if (countBadgeEl) {
    countBadgeEl.textContent = incidents.length;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="anomaly-empty-state">✓ No matching anomalies detected.</div>`;
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach(inc => {
    const sev = getSeverity(inc.type);
    const row = document.createElement('div');
    row.className = 'anomaly-incident-row';
    row.dataset.satId = inc.satelliteId;
    row.title = `Click to focus 3D globe on ${inc.satelliteName}`;

    row.innerHTML = `
      <div class="incident-top">
        <span class="incident-sat-name">${inc.satelliteName}</span>
        <span class="incident-sev-badge" style="color:${sev.color}; background:${sev.bg}; border: 1px solid ${sev.border}">
          ${sev.level}
        </span>
        <span class="incident-time" data-ts="${inc.timestamp}">${formatRelativeTime(inc.timestamp)}</span>
      </div>
      <div class="incident-desc">${formatViolation(inc.type, inc.value, inc.threshold)}</div>
    `;

    row.addEventListener('click', () => {
      onInspectSatellite?.(inc.satelliteId);
    });

    listEl.appendChild(row);
  });
}

function refreshTimestamps() {
  if (!listEl) return;
  const timeEls = listEl.querySelectorAll('.incident-time');
  timeEls.forEach(el => {
    const ts = parseInt(el.dataset.ts, 10);
    if (!isNaN(ts)) {
      el.textContent = formatRelativeTime(ts);
    }
  });
}

/**
 * Called in real-time when a new anomaly event arrives via WebSocket
 */
export function addRealtimeAnomaly({ satelliteId, satelliteName, type = 'TEMP_CRITICAL', value = 97.4, threshold = 90 }, onInspectSatellite) {
  const newIncident = {
    id: `inc-${Date.now()}`,
    satelliteId,
    satelliteName: satelliteName || `Sat #${satelliteId}`,
    type,
    value,
    threshold,
    timestamp: Date.now(),
  };

  incidents.unshift(newIncident);

  if (countBadgeEl) {
    countBadgeEl.textContent = incidents.length;
  }

  // Prepend to list
  if (listEl) {
    const emptyState = listEl.querySelector('.anomaly-empty-state');
    if (emptyState) emptyState.remove();

    const sev = getSeverity(newIncident.type);
    const row = document.createElement('div');
    row.className = 'anomaly-incident-row incident-new-flash';
    row.dataset.satId = newIncident.satelliteId;

    row.innerHTML = `
      <div class="incident-top">
        <span class="incident-sat-name">${newIncident.satelliteName}</span>
        <span class="incident-sev-badge" style="color:${sev.color}; background:${sev.bg}; border: 1px solid ${sev.border}">
          ${sev.level}
        </span>
        <span class="incident-time" data-ts="${newIncident.timestamp}">just now</span>
      </div>
      <div class="incident-desc">${formatViolation(newIncident.type, newIncident.value, newIncident.threshold)}</div>
    `;

    row.addEventListener('click', () => {
      onInspectSatellite?.(newIncident.satelliteId);
    });

    listEl.prepend(row);

    // Remove animation class after animation completes
    setTimeout(() => row.classList.remove('incident-new-flash'), 1000);
  }
}
