import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';

const NORMAL_COLOR = 0x00e5a0;
const ANOMALY_COLOR = 0xf43f5e;
const DOT_RADIUS_OFFSET = 0.02; // lift dots slightly above the sphere surface

/**
 * Converts latitude/longitude (degrees) to an xyz position on a sphere of
 * the given radius, using the standard equirectangular convention:
 *  - lat  90  -> north pole (+y)
 *  - lat -90  -> south pole (-y)
 *  - lng   0  -> faces +z (matches the seam of most Earth texture UVs)
 */
export function latLngToXYZ(lat, lng, radius = GLOBE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);   // polar angle from +y
  const theta = (lng + 180) * (Math.PI / 180); // azimuthal angle

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

/**
 * Deterministic placeholder seed data for 50 satellites, evenly spread
 * using a Fibonacci-sphere distribution (not random — so positions are
 * stable across reloads until the real backend seed data replaces this
 * in Week 5).
 */
export function generateSeedSatellites(count = 50) {
  const sats = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lng = (((goldenAngle * i * 180) / Math.PI) % 360) - 180;

    sats.push({
      id: `SAT-${String(i + 1).padStart(3, '0')}`,
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
      status: 'normal',
    });
  }
  return sats;
}

/**
 * Fetches the REAL satellite list from the backend (id, name, orbit_type)
 * and lays them out using the same Fibonacci-sphere distribution as before —
 * positions stay purely cosmetic, but each dot is now keyed by the actual
 * Postgres id instead of a fake "SAT-001" string. This removes the need for
 * any id-translation hack elsewhere (e.g. main.js's old modulo mapping),
 * since incoming Socket.io events' satellite_id now matches dot ids directly.
 */
export async function fetchSatellitesWithPositions(apiBaseUrl) {
  const res = await fetch(`${apiBaseUrl}/api/satellites`);
  if (!res.ok) {
    throw new Error(`Failed to fetch satellites: ${res.status}`);
  }
  const satellites = await res.json(); // [{ id, name, orbit_type }, ...]
  const count = satellites.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return satellites.map((sat, i) => {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lng = (((goldenAngle * i * 180) / Math.PI) % 360) - 180;

   return {
  id: sat.id,
  name: sat.name,
  lat: Number(lat.toFixed(4)),
  lng: Number(lng.toFixed(4)),
  status: sat.status || 'normal', // real current status from backend
};

/**
 * Creates one small sphere ("dot") per satellite, positioned on the globe
 * surface, plus a soft glow sprite so anomalies read clearly from a distance.
 * Returns { group, dotsById } so other modules (fakeData, sockets later) can
 * look up and recolor individual dots by satellite id.
 */
export function createSatelliteDots(satellites) {
  const group = new THREE.Group();
  const dotsById = new Map();

  const dotGeometry = new THREE.SphereGeometry(0.035, 12, 12);

     satellites.forEach((sat) => {
  const color = sat.status === 'anomaly' ? ANOMALY_COLOR : NORMAL_COLOR;
  const material = new THREE.MeshBasicMaterial({ color });
  const dot = new THREE.Mesh(dotGeometry, material);

    const pos = latLngToXYZ(sat.lat, sat.lng, GLOBE_RADIUS + DOT_RADIUS_OFFSET);
    dot.position.copy(pos);
    dot.userData.satelliteId = sat.id;

    group.add(dot);
    dotsById.set(sat.id, dot);
  });

  return { group, dotsById };
}

export function setDotStatus(dot, status) {
  dot.material.color.set(status === 'anomaly' ? ANOMALY_COLOR : NORMAL_COLOR);
  dot.userData.status = status;
}

export const COLORS = { NORMAL_COLOR, ANOMALY_COLOR };
