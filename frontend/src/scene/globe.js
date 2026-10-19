import * as THREE from 'three';

export const GLOBE_RADIUS = 2;

// Generates a procedural Earth texture so the globe is instantly visible,
// stylish, and beautiful even if external CDNs are slow or offline.
function createProceduralEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Deep space-blue ocean
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 512);
  oceanGrad.addColorStop(0, '#0a1428');
  oceanGrad.addColorStop(0.5, '#0d1b38');
  oceanGrad.addColorStop(1, '#0a1428');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Latitude and Longitude grid lines
  ctx.strokeStyle = 'rgba(0, 229, 160, 0.12)';
  ctx.lineWidth = 1;

  for (let lat = 0; lat <= 512; lat += 32) {
    ctx.beginPath();
    ctx.moveTo(0, lat);
    ctx.lineTo(1024, lat);
    ctx.stroke();
  }

  for (let lng = 0; lng <= 1024; lng += 64) {
    ctx.beginPath();
    ctx.moveTo(lng, 0);
    ctx.lineTo(lng, 512);
    ctx.stroke();
  }

  // Equator line highlighted
  ctx.strokeStyle = 'rgba(0, 229, 160, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 256);
  ctx.lineTo(1024, 256);
  ctx.stroke();

  // Draw simplified continents using geometric arcs
  ctx.fillStyle = 'rgba(28, 55, 92, 0.6)';
  
  // North America
  ctx.beginPath();
  ctx.ellipse(220, 160, 90, 60, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // South America
  ctx.beginPath();
  ctx.ellipse(320, 340, 50, 90, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eurasia
  ctx.beginPath();
  ctx.ellipse(650, 150, 140, 70, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Africa
  ctx.beginPath();
  ctx.ellipse(540, 270, 60, 80, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Australia
  ctx.beginPath();
  ctx.ellipse(820, 360, 50, 40, -0.1, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGlobe() {
  const group = new THREE.Group();

  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
  const fallbackTexture = createProceduralEarthTexture();

  const material = new THREE.MeshStandardMaterial({
    map: fallbackTexture,
    roughness: 0.8,
    metalness: 0.15,
  });

  const earthMesh = new THREE.Mesh(geometry, material);
  group.add(earthMesh);

  // Outer glowing atmosphere shield
  const atmosGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.025, 48, 48);
  const atmosMaterial = new THREE.MeshBasicMaterial({
    color: 0x00e5a0,
    transparent: true,
    opacity: 0.08,
    wireframe: true,
  });
  const atmosMesh = new THREE.Mesh(atmosGeometry, atmosMaterial);
  group.add(atmosMesh);

  // Orbital rings around the globe
  const orbitRadii = [GLOBE_RADIUS + 0.3, GLOBE_RADIUS + 0.6, GLOBE_RADIUS + 0.9];
  orbitRadii.forEach((r, idx) => {
    const ringGeo = new THREE.RingGeometry(r - 0.005, r + 0.005, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x5a5f7a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.15 + idx * 0.05,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 + (idx * 0.4);
    ring.rotation.y = idx * 0.3;
    group.add(ring);
  });

  // Try loading high-res photorealistic earth texture from CDN asynchronously
  const EARTH_TEXTURE_URL =
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg';

  const loader = new THREE.TextureLoader();
  loader.load(
    EARTH_TEXTURE_URL,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {
      // Fallback already assigned seamlessly
    }
  );

  return group;
}
