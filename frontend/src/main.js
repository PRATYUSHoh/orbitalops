import { createScene } from './scene/scene.js';
import { createGlobe } from './scene/globe.js';
import { generateSeedSatellites, createSatelliteDots } from './scene/satellites.js';
import { startFakeActivity } from './scene/fakeData.js';
import { renderOverlay } from './ui/overlay.js';

const canvas = document.getElementById('globe-canvas');
const hud = document.getElementById('hud');

const { scene, camera, renderer, controls } = createScene(canvas);

const globe = createGlobe();
scene.add(globe);

const satellites = generateSeedSatellites(50);
const { group: dotGroup, dotsById } = createSatelliteDots(satellites);
scene.add(dotGroup);

renderOverlay(hud, { satelliteCount: satellites.length });

// Week 0 only — deleted in Week 5 once real telemetry events drive this.
startFakeActivity(dotsById);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
