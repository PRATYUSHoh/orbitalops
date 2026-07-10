import * as THREE from 'three';

// Official three.js example texture, served off jsDelivr's CDN mirror of the
// three.js GitHub repo. Stable and free — swap this URL for a local file in
// src/assets/ later if you want to work offline or want a different look.
const EARTH_TEXTURE_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg';

export const GLOBE_RADIUS = 2;

/**
 * Builds the Earth sphere and loads the equirectangular texture onto it.
 * Returns the mesh immediately (so it can be added to the scene right away)
 * and resolves the texture asynchronously — the sphere just looks grey/dark
 * until the texture finishes loading.
 */
export function createGlobe() {
  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
  const material = new THREE.MeshStandardMaterial({
    color: 0x223344,
    roughness: 0.9,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);

  const loader = new THREE.TextureLoader();
  loader.load(
    EARTH_TEXTURE_URL,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.warn('[globe] Earth texture failed to load, using flat color fallback.', err);
    }
  );

  return mesh;
}
