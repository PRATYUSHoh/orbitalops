import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
/**
 * Sets up the base three.js scene: renderer, camera, controls, lighting.
 * Returns handles so other modules (globe, satellites) can add to the scene
 * and main.js can drive the render loop.
 */
export function createScene(canvas) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 6);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3.2;
  controls.maxDistance = 12;
  controls.enablePan = false;
  controls.rotateSpeed = 0.5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;

  // Simple lighting — ambient + a directional "sun" so the sphere isn't flat
  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(5, 3, 5);
  scene.add(ambient, sun);

  // Faint starfield backdrop so the globe doesn't float in a void
  scene.add(createStarfield());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls };
}

function createStarfield(count = 1500) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // random point in a shell far outside the globe
    const r = 40 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x5a5f7a, size: 0.05 });
  return new THREE.Points(geo, mat);
}
