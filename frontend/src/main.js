import { createScene } from './scene/scene.js';
import { createGlobe } from './scene/globe.js';
import { generateSeedSatellites, createSatelliteDots, setDotStatus } from './scene/satellites.js';
import { renderOverlay } from './ui/overlay.js';
import { connectLiveData } from './scene/liveData.js';

const canvas = document.getElementById('globe-canvas');
const hud = document.getElementById('hud');

const { scene, camera, renderer, controls } = createScene(canvas);

const globe = createGlobe();
scene.add(globe);

const satellites = generateSeedSatellites(50);
const { group: dotGroup, dotsById } = createSatelliteDots(satellites);
scene.add(dotGroup);

renderOverlay(hud, { satelliteCount: satellites.length });

// --- Week 5: real-time backend wiring (replaces Week 0's startFakeActivity) ---

const API_BASE_URL = 'http://localhost:3001'; // swap to Railway URL after deploy

const connectionStatusEl = document.getElementById('connection-status');

// The frontend's 50 dots use placeholder ids "SAT-001".."SAT-050" (from
// generateSeedSatellites' Fibonacci-sphere layout) — these have NO real
// connection to the backend's Postgres `satellites` table, which uses
// numeric ids (2-51 from seed.js, since id 1 is the original TestSat-1).
// This is intentionally a cosmetic, one-way mapping (not meant to reflect
// real orbital correspondence), so we deterministically fold any incoming
// numeric satellite_id onto one of the 50 existing dots via modulo.
function satelliteIdToDotId(satellite_id) {
  const index = ((satellite_id - 1) % 50) + 1;
  return `SAT-${String(index).padStart(3, '0')}`;
}

connectLiveData({
  apiBaseUrl: API_BASE_URL,
  onEvent: ({ satellite_id, isAnomaly }) => {
    const dotId = satelliteIdToDotId(satellite_id);
    const dot = dotsById.get(dotId);
    if (dot) {
      setDotStatus(dot, isAnomaly ? 'anomaly' : 'normal');
    } else {
      console.warn(`[liveData] No dot found for ${dotId} (satellite_id=${satellite_id})`);
    }
  },
  onConnectionChange: (connected) => {
    if (connectionStatusEl) {
      connectionStatusEl.textContent = connected ? '● Live' : '● Disconnected';
      connectionStatusEl.style.color = connected ? '#00e5a0' : '#ef4444';
    }
  },
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();