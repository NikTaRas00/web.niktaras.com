// The track's geometric model: a stadium-shaped centerline (two straights + two semicircle
// turns) parametrized by lap fraction t in [0,1), plus a periodic elevation profile so the
// track climbs and descends like a real circuit but always meets itself at the start/finish line.

import { TRACK } from './config.js';

const { straight: STRAIGHT, turnRadius: TURN_R, totalLen: TOTAL_LEN, samples: SAMPLES } = TRACK;

export { STRAIGHT, TURN_R, TOTAL_LEN, SAMPLES };

export function centerAt(t) {
  let s = (((t % 1) + 1) % 1) * TOTAL_LEN;
  if (s < STRAIGHT) {
    return { x: -STRAIGHT / 2 + s, z: TURN_R };
  }
  s -= STRAIGHT;
  const arc = Math.PI * TURN_R;
  if (s < arc) {
    const a = Math.PI / 2 - s / TURN_R;
    return { x: STRAIGHT / 2 + TURN_R * Math.cos(a), z: TURN_R * Math.sin(a) };
  }
  s -= arc;
  if (s < STRAIGHT) {
    return { x: STRAIGHT / 2 - s, z: -TURN_R };
  }
  s -= STRAIGHT;
  const a = -Math.PI / 2 - s / TURN_R;
  return { x: -STRAIGHT / 2 + TURN_R * Math.cos(a), z: TURN_R * Math.sin(a) };
}

export function tangentAt(t) {
  const eps = 0.0006;
  const p1 = centerAt(t - eps), p2 = centerAt(t + eps);
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

export function elevationAt(t) {
  let y = 0;
  for (const h of TRACK.elevationHarmonics) {
    y += h.amp * Math.sin(2 * Math.PI * h.freq * t + h.phase);
  }
  return y;
}

// full 3D sample: position, tangent (xz-unit), and the left-hand normal (xz-unit, 90° CCW of tangent)
export function trackPoint(t) {
  const c = centerAt(t);
  const tan = tangentAt(t);
  return {
    t, x: c.x, z: c.z, y: elevationAt(t),
    tan,
    nx: -tan.z, nz: tan.x,
  };
}

// precomputed samples, used by every other module for nearest-point queries (off-track
// detection, terrain blending, traffic lane placement) instead of re-walking the spline math.
export const centerline = [];
for (let i = 0; i < SAMPLES; i++) centerline.push(trackPoint(i / SAMPLES));

// nearest centerline sample to a world (x,z), by brute-force scan. `stride` trades accuracy for
// speed — stride 1 for the handful of per-frame car queries, a larger stride for the one-time
// terrain mesh bake which queries tens of thousands of points and doesn't need per-meter precision.
export function nearestCenterlinePoint(x, z, stride = 1) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < SAMPLES; i += stride) {
    const p = centerline[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return { point: best, dist: Math.sqrt(bestD) };
}
