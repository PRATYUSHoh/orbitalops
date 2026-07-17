import * as THREE from 'three';
import { createScene } from './scene/scene.js';
import { createGlobe } from './scene/globe.js';
import { fetchSatellitesWithPositions, generateSeedSatellites, createSatelliteDots, setDotStatus } from './scene/satellites.js';
import { renderOverlay } from './ui/overlay.js';
import { connectLiveData } from './scene/liveData.js';
import { showLoading, showSatelliteDetail, showError } from './ui/detailPanel.js';
import { addTickerEvent } from './ui/eventTicker.js';
import { startStatsPolling } from './ui/statsBar.js';

const canvas = document.getElementById('globe-canvas');
const hud = document.getElementById('hud');

const { scene, camera, renderer, controls } = createScene(canvas);

const globe = createGlobe();
scene.add(globe);

const API_BASE_URL = 'https://orbitalops.onrender.com';
const connectionStatusEl = document.getElementById('connection-status');

// Fetch REAL satellites from the backend. Falls back to the old fake
// generator only if the backend is unreachable, so the globe still renders
// something instead of a blank page during a demo hiccup.
let satellites;
try {
  satellites = await fetchSatellitesWithPositions(API_BASE_URL);
} catch (err) {
  console.warn('[main] Could not fetch real satellites, using fallback seed data.', err);
  satellites = generateSeedSatellites(50);
}

const { group: dotGroup, dotsById } = createSatelliteDots(satellites);
scene.add(dotGroup);

renderOverlay(hud, { satelliteCount: satellites.length });

// --- Week 5: real-time backend wiring ---
// No more id-translation hack needed — dotsById is now keyed by the SAME
// numeric satellite_id that arrives in each telemetry_processed event.
const satelliteNameById = new Map(satellites.map((s) => [s.id, s.name]));

connectLiveData({
  apiBaseUrl: API_BASE_URL,
  onEvent: ({ satellite_id, isAnomaly }) => {
    const dot = dotsById.get(satellite_id);
    if (dot) {
      setDotStatus(dot, isAnomaly ? 'anomaly' : 'normal');
    } else {
      console.warn(`[liveData] No dot found for satellite_id=${satellite_id}`);
    }
    addTickerEvent({
      name: satelliteNameById.get(satellite_id),
      satelliteId: satellite_id,
      isAnomaly,
    });
  },
  onConnectionChange: (connected) => {
    if (connectionStatusEl) {
      connectionStatusEl.textContent = connected ? '● Live' : '● Disconnected';
      connectionStatusEl.style.color = connected ? '#00e5a0' : '#ef4444';
    }
  },
});

startStatsPolling(API_BASE_URL);

// --- Click-to-inspect: raycast against dots, fetch real health data ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('click', async (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(dotGroup.children);

  if (intersects.length === 0) return;

  const satelliteId = intersects[0].object.userData.satelliteId;
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
});
// --- Demo trigger button: fires one realistic anomalous event at a random
// tracked satellite, so you can demo the live pipeline in an interview with
// a single click — no terminal, no memorized curl command needed. ---
function createDemoTriggerButton() {
  const btn = document.createElement('button');
  btn.id = 'demo-trigger-btn';
  btn.className = 'demo-trigger-btn';
  btn.textContent = '⚡ Trigger Demo Anomaly';
  document.getElementById('app').appendChild(btn);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Sending…';

    const randomSat = satellites[Math.floor(Math.random() * satellites.length)];

    try {
      await fetch(`${API_BASE_URL}/api/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          satellite_id: randomSat.id,
          temperature: 95,   // > TEMP_CRITICAL (90)
          battery: 5,        // < BATTERY_LOW (10)
          signal_strength: -130, // < SIGNAL_LOST (-120)
        }),
      });
      btn.textContent = `✓ Sent to ${randomSat.name}`;
    } catch (err) {
      console.error('[demoTrigger] failed', err);
      btn.textContent = '✕ Failed — check console';
    }

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '⚡ Trigger Demo Anomaly';
    }, 2000);
  });
}

createDemoTriggerButton();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
