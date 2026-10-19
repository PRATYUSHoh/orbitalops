import * as THREE from 'three';
import { createScene } from './scene/scene.js';
import { createGlobe } from './scene/globe.js';
import { fetchSatellitesWithPositions, generateSeedSatellites, createSatelliteDots, setDotStatus } from './scene/satellites.js';
import { renderOverlay } from './ui/overlay.js';
import { connectLiveData } from './scene/liveData.js';
import { showLoading, showSatelliteDetail, showError } from './ui/detailPanel.js';
import { addTickerEvent } from './ui/eventTicker.js';
import { startStatsPolling, refreshStats } from './ui/statsBar.js';
import { openGrafanaModal } from './ui/grafanaModal.js';
import { createAnomalyNotificationPanel, addRealtimeAnomaly } from './ui/anomalyPanel.js';

const canvas = document.getElementById('globe-canvas');
const hud = document.getElementById('hud');

const { scene, camera, renderer, controls } = createScene(canvas);

const globe = createGlobe();
scene.add(globe);

const API_BASE_URL = '';

let satellites = [];
let dotGroup = null;
let dotsById = new Map();
let satelliteNameById = new Map();
let selectedSatelliteId = 1;

async function init() {
  try {
    satellites = await fetchSatellitesWithPositions(API_BASE_URL);
    if (!satellites || satellites.length === 0) {
      satellites = generateSeedSatellites(50);
    }
  } catch (err) {
    console.warn('[main] Could not fetch real satellites, using fallback seed data.', err);
    satellites = generateSeedSatellites(50);
  }

  if (dotGroup) {
    scene.remove(dotGroup);
  }

  // Create all 50 satellite dots with alert halos
  const created = createSatelliteDots(satellites);
  dotGroup = created.group;
  dotsById = created.dotsById;
  scene.add(dotGroup);

  // Render unified Mission Control HUD top navbar and bottom status bar
  renderOverlay(hud, { satelliteCount: satellites.length });

  const grafanaBtn = document.getElementById('open-grafana-btn');
  if (grafanaBtn) {
    grafanaBtn.addEventListener('click', () => openGrafanaModal(API_BASE_URL));
  }

  satellites.forEach((s) => satelliteNameById.set(s.id, s.name));

  // If there are initial anomalous satellites, set default selection to one of them
  const initialAnomaly = satellites.find(s => s.status === 'anomaly');
  if (initialAnomaly) {
    selectedSatelliteId = initialAnomaly.id;
  }

  connectLiveData({
    apiBaseUrl: API_BASE_URL,
    onEvent: ({ satellite_id, isAnomaly }) => {
      const dot = dotsById.get(satellite_id);
      if (dot) {
        setDotStatus(dot, isAnomaly ? 'anomaly' : 'normal');
      }

      // Update satellite model status
      const sat = satellites.find(s => s.id === satellite_id);
      if (sat) {
        sat.status = isAnomaly ? 'anomaly' : 'normal';
      }

      addTickerEvent({
        name: satelliteNameById.get(satellite_id) || `Sat-${satellite_id}`,
        satelliteId: satellite_id,
        isAnomaly,
      });

      // Instantly refresh active anomaly counter in top navbar
      refreshStats(API_BASE_URL);
      updateSelectorOptions();

      if (isAnomaly) {
        fetch(`${API_BASE_URL}/api/satellites/${satellite_id}/health`)
          .then(r => r.json())
          .then(healthData => {
            const latestAlert = healthData.recent_alerts?.[0];
            addRealtimeAnomaly({
              satelliteId: satellite_id,
              satelliteName: satelliteNameById.get(satellite_id),
              type: latestAlert?.type || 'TEMP_CRITICAL',
              value: latestAlert?.value || 97.4,
              threshold: latestAlert?.threshold || 90,
            }, (targetId) => {
              selectedSatelliteId = targetId;
              const selector = document.getElementById('sat-selector');
              if (selector) selector.value = targetId;
              focusOnSatellite(targetId);
              inspectSatellite(targetId);
            });
          })
          .catch(() => {});
      }

      // If the currently inspected satellite is the one updated, refresh its detail panel
      const detailPanel = document.getElementById('detail-panel');
      if (detailPanel && !detailPanel.classList.contains('hidden') && selectedSatelliteId === satellite_id) {
        inspectSatellite(satellite_id);
      }
    },
    onConnectionChange: (connected) => {
      const el = document.getElementById('connection-status');
      if (el) {
        el.textContent = connected ? '● LIVE LINK' : '● OFFLINE';
        el.className = connected ? 'hud-link-status live' : 'hud-link-status disconnected';
      }
    },
  });

  startStatsPolling(API_BASE_URL);
  createMissionControlUI();
  createAnomalyNotificationPanel({
    apiBaseUrl: API_BASE_URL,
    onInspectSatellite: (satId) => {
      selectedSatelliteId = satId;
      const selector = document.getElementById('sat-selector');
      if (selector) selector.value = satId;
      focusOnSatellite(satId);
      inspectSatellite(satId);
    },
  });

  // If an initial anomaly exists, automatically focus camera on it so it is immediately visible
  if (initialAnomaly) {
    setTimeout(() => {
      focusOnSatellite(initialAnomaly.id);
      inspectSatellite(initialAnomaly.id);
    }, 600);
  }
}

// Smoothly swivel and zoom camera to face the targeted satellite
function focusOnSatellite(satId) {
  const dot = dotsById.get(satId);
  if (!dot) return;

  const targetPos = dot.position.clone().normalize().multiplyScalar(5.2);
  const startPos = camera.position.clone();
  const startTime = performance.now();
  const duration = 700;

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    camera.position.lerpVectors(startPos, targetPos, ease);
    controls.target.set(0, 0, 0);
    controls.update();
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// Click on dot in 3D space
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('click', async (event) => {
  if (!dotGroup || dotGroup.children.length === 0) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(dotGroup.children, true);

  if (intersects.length === 0) return;

  // Find topmost satellite dot
  let hit = intersects[0].object;
  while (hit && hit.userData.satelliteId === undefined && hit.parent) {
    hit = hit.parent;
  }

  if (hit && hit.userData.satelliteId !== undefined) {
    const satId = hit.userData.satelliteId;
    selectedSatelliteId = satId;
    const selector = document.getElementById('sat-selector');
    if (selector) selector.value = satId;
    inspectSatellite(satId);
  }
});

async function inspectSatellite(satelliteId) {
  showLoading(satelliteId);
  try {
    const res = await fetch(`${API_BASE_URL}/api/satellites/${satelliteId}/health`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    showSatelliteDetail(data);
  } catch (err) {
    console.error('[detailPanel] fetch failed', err);
    showError(satelliteId, err.message);
  }
}

let selectorElement = null;

function updateSelectorOptions() {
  if (!selectorElement) return;
  const currVal = selectorElement.value;
  selectorElement.innerHTML = '';
  satellites.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.orbit_type}) ${s.status === 'anomaly' ? '⚠️ ANOMALY' : '✓ OK'}`;
    if (s.status === 'anomaly') {
      opt.style.color = '#f43f5e';
      opt.style.fontWeight = 'bold';
    }
    selectorElement.appendChild(opt);
  });
  if (currVal) selectorElement.value = currVal;
}

function createMissionControlUI() {
  if (document.getElementById('mission-controls-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'mission-controls-wrapper';
  wrapper.className = 'mission-controls-card';

  // Mission control header
  const header = document.createElement('div');
  header.className = 'mission-ctrl-header';
  header.innerHTML = `
    <span class="ctrl-indicator">▲</span>
    <span class="ctrl-title">COMMAND UPLINK // SIMULATOR</span>
    <span class="ctrl-tx-tag">TX READY</span>
  `;
  wrapper.appendChild(header);

  // Target satellite selector bar
  const topRow = document.createElement('div');
  topRow.className = 'mission-ctrl-row';

  const label = document.createElement('span');
  label.textContent = 'TARGET:';
  label.className = 'mission-ctrl-label';

  selectorElement = document.createElement('select');
  selectorElement.id = 'sat-selector';
  selectorElement.className = 'mission-ctrl-select';

  updateSelectorOptions();
  selectorElement.value = selectedSatelliteId;

  selectorElement.addEventListener('change', () => {
    selectedSatelliteId = parseInt(selectorElement.value, 10);
    focusOnSatellite(selectedSatelliteId);
    inspectSatellite(selectedSatelliteId);
  });

  const focusBtn = document.createElement('button');
  focusBtn.textContent = '🎯 Focus';
  focusBtn.className = 'mission-ctrl-focus-btn';
  focusBtn.addEventListener('click', () => {
    focusOnSatellite(selectedSatelliteId);
    inspectSatellite(selectedSatelliteId);
  });

  topRow.appendChild(label);
  topRow.appendChild(selectorElement);
  topRow.appendChild(focusBtn);

  // Buttons row
  const btnRow = document.createElement('div');
  btnRow.className = 'mission-ctrl-row';

  // Anomaly type selector
  const anomalyTypeSelect = document.createElement('select');
  anomalyTypeSelect.id = 'anomaly-type-select';
  anomalyTypeSelect.className = 'mission-ctrl-select anomaly-select';
  anomalyTypeSelect.innerHTML = `
    <option value="TEMP">🔥 Overheat (>90°C)</option>
    <option value="BATT">🪫 Low Battery (<10%)</option>
    <option value="SIGNAL">📡 Signal Lost (<-120dBm)</option>
    <option value="ALL">💥 Multi-Failure (All 3)</option>
  `;

  // Action 1: Trigger Anomaly (Break it)
  const anomalyBtn = document.createElement('button');
  anomalyBtn.id = 'demo-trigger-btn';
  anomalyBtn.className = 'mission-ctrl-action-btn trigger-anomaly-btn';
  anomalyBtn.textContent = '⚡ Trigger';
  anomalyBtn.title = 'Send selected anomaly telemetry';

  anomalyBtn.addEventListener('click', async () => {
    anomalyBtn.disabled = true;
    anomalyBtn.textContent = 'Injecting…';

    const targetSat = satellites.find(s => s.id === selectedSatelliteId) || satellites[0];
    const failureType = anomalyTypeSelect.value;

    let temp = 42.0;
    let batt = 88.0;
    let signal = -68.0;

    if (failureType === 'TEMP' || failureType === 'ALL') temp = 97.4;
    if (failureType === 'BATT' || failureType === 'ALL') batt = 4.2;
    if (failureType === 'SIGNAL' || failureType === 'ALL') signal = -135.0;

    try {
      await fetch(`${API_BASE_URL}/api/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          satellite_id: targetSat.id,
          temperature: temp,
          battery: batt,
          signal_strength: signal,
        }),
      });
      focusOnSatellite(targetSat.id);
      setTimeout(() => inspectSatellite(targetSat.id), 120);
    } catch (err) {
      console.error('[anomalyTrigger] failed', err);
    }

    setTimeout(() => {
      anomalyBtn.disabled = false;
      anomalyBtn.textContent = '⚡ Trigger';
    }, 1200);
  });

  // Action 2: Heal Satellite (Charge & Cool down)
  const healBtn = document.createElement('button');
  healBtn.className = 'mission-ctrl-action-btn heal-satellite-btn';
  healBtn.textContent = '🔋 Heal Satellite';
  healBtn.title = 'Send healthy telemetry: Cool down to 42°C, Charge battery to 92%';

  healBtn.addEventListener('click', async () => {
    healBtn.disabled = true;
    healBtn.textContent = 'Recharging…';

    const targetSat = satellites.find(s => s.id === selectedSatelliteId) || satellites[0];

    try {
      await fetch(`${API_BASE_URL}/api/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          satellite_id: targetSat.id,
          temperature: 38.5,
          battery: 94.0,
          signal_strength: -62.0,
        }),
      });
      focusOnSatellite(targetSat.id);
      setTimeout(() => inspectSatellite(targetSat.id), 120);
    } catch (err) {
      console.error('[healTrigger] failed', err);
    }

    setTimeout(() => {
      healBtn.disabled = false;
      healBtn.textContent = '🔋 Heal Satellite';
    }, 1200);
  });

  btnRow.appendChild(anomalyTypeSelect);
  btnRow.appendChild(anomalyBtn);
  btnRow.appendChild(healBtn);

  wrapper.appendChild(topRow);
  wrapper.appendChild(btnRow);

  const appEl = document.getElementById('app') || document.body;
  appEl.appendChild(wrapper);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

init();
