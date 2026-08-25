// The circuit's geometric model.
//
// The centerline is a closed polygon of city junctions with each corner replaced by a tangent
// circular fillet — the same construction a real street circuit uses, and it means the whole path
// is made of exact lines and arcs. That in turn gives exact arc-length parametrization for free:
// lap fraction t in [0,1) maps linearly to distance travelled, which is what traffic pacing,
// building frontage spacing and lap timing all rely on.

import { TRACK } from './config.js';

const WPS = TRACK.waypoints;
const N = WPS.length;

// ---------------------------------------------------------------- path construction

function buildCorners() {
  const corners = [];
  for (let i = 0; i < N; i++) {
    const P = WPS[(i - 1 + N) % N], V = WPS[i], W = WPS[(i + 1) % N];
    const inLen = Math.hypot(V.x - P.x, V.z - P.z);
    const outLen = Math.hypot(W.x - V.x, W.z - V.z);
    const ux = (V.x - P.x) / inLen, uz = (V.z - P.z) / inLen;   // incoming unit direction
    const vx = (W.x - V.x) / outLen, vz = (W.z - V.z) / outLen; // outgoing unit direction

    // signed turn angle from u to v; positive means the corner turns toward the left normal
    const cross = ux * vz - uz * vx;
    const turn = Math.atan2(cross, ux * vx + uz * vz);

    let d = 0, r = 0;
    if (Math.abs(turn) > 1e-4) {
      const tanHalf = Math.tan(Math.abs(turn) / 2);
      // tangent length; clamped so two fillets can never eat more than one leg between them
      d = Math.min(V.r * tanHalf, 0.45 * inLen, 0.45 * outLen);
      r = d / tanHalf;
    }
    const sgn = cross >= 0 ? 1 : -1;
    const ax = V.x - ux * d, az = V.z - uz * d;   // arc entry
    const bx = V.x + vx * d, bz = V.z + vz * d;   // arc exit
    // arc center sits perpendicular to the incoming leg, on the side the corner turns toward
    const cx = ax + -uz * sgn * r, cz = az + ux * sgn * r;
    corners.push({ ax, az, bx, bz, cx, cz, r, sgn, turn });
  }
  return corners;
}

// Segments run: straight out of corner 0, arc of corner 1, straight, arc of corner 2, ... so s = 0
// lands just past the first corner — on the main straight, where a start/finish line belongs.
function buildSegments(corners) {
  const segs = [];
  for (let i = 0; i < N; i++) {
    const c = corners[i], next = corners[(i + 1) % N];
    const lx = next.ax - c.bx, lz = next.az - c.bz;
    const len = Math.hypot(lx, lz);
    if (len > 1e-6) segs.push({ kind: 'line', x: c.bx, z: c.bz, tx: lx / len, tz: lz / len, len });
    if (next.r > 1e-6) {
      segs.push({
        kind: 'arc',
        cx: next.cx, cz: next.cz, r: next.r, sgn: next.sgn,
        a0: Math.atan2(next.az - next.cz, next.ax - next.cx),
        len: next.r * Math.abs(next.turn),
      });
    }
  }
  return segs;
}

const SEGS = buildSegments(buildCorners());
let _acc = 0;
for (const s of SEGS) { s.s0 = _acc; _acc += s.len; }

export const TOTAL_LEN = _acc;
export const SAMPLES = Math.round(TOTAL_LEN / TRACK.sampleSpacing);

function wrapS(s) {
  s %= TOTAL_LEN;
  return s < 0 ? s + TOTAL_LEN : s;
}

// position + unit tangent + signed curvature at a distance along the path
function poseAtS(s) {
  s = wrapS(s);
  let lo = 0, hi = SEGS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SEGS[mid].s0 <= s) lo = mid; else hi = mid - 1;
  }
  const seg = SEGS[lo];
  const u = s - seg.s0;
  if (seg.kind === 'line') {
    return { x: seg.x + seg.tx * u, z: seg.z + seg.tz * u, tx: seg.tx, tz: seg.tz, k: 0 };
  }
  const ang = seg.a0 + seg.sgn * (u / seg.r);
  return {
    x: seg.cx + seg.r * Math.cos(ang),
    z: seg.cz + seg.r * Math.sin(ang),
    tx: -seg.sgn * Math.sin(ang),
    tz: seg.sgn * Math.cos(ang),
    k: seg.sgn / seg.r,
  };
}

// ---------------------------------------------------------------- public parametrization

export function poseAt(t) { return poseAtS(t * TOTAL_LEN + TRACK.startOffset); }
export function centerAt(t) { const p = poseAt(t); return { x: p.x, z: p.z }; }
export function tangentAt(t) { const p = poseAt(t); return { x: p.tx, z: p.tz }; }
export function curvatureAt(t) { return poseAt(t).k; }

export function elevationAt(t) {
  let y = 0;
  for (const h of TRACK.elevationHarmonics) {
    y += h.amp * Math.sin(2 * Math.PI * h.freq * t + h.phase);
  }
  return y;
}

// road grade (dy/ds) — analytic, so cars pitch exactly with the surface they sit on
export function gradeAt(t) {
  let dy = 0;
  for (const h of TRACK.elevationHarmonics) {
    dy += h.amp * 2 * Math.PI * h.freq * Math.cos(2 * Math.PI * h.freq * t + h.phase);
  }
  return dy / TOTAL_LEN;
}

// full 3D sample: position, tangent (xz-unit), and the left-hand normal (xz-unit, 90° CCW of tangent)
export function trackPoint(t) {
  const p = poseAt(t);
  return { t, x: p.x, z: p.z, y: elevationAt(t), tx: p.tx, tz: p.tz, nx: -p.tz, nz: p.tx, k: p.k };
}

export const centerline = [];
for (let i = 0; i < SAMPLES; i++) centerline.push(trackPoint(i / SAMPLES));

// ---------------------------------------------------------------- nearest-point queries
//
// Terrain baking and city layout together fire tens of thousands of "how far is this from the
// road?" queries, so the samples go into a uniform bucket grid and each query walks outward one
// ring at a time, stopping as soon as no unvisited ring can beat the best hit found so far.

const CELL = 26;
let gMinX = Infinity, gMinZ = Infinity, gNX = 0, gNZ = 0;
const buckets = [];
{
  let maxX = -Infinity, maxZ = -Infinity;
  for (const p of centerline) {
    if (p.x < gMinX) gMinX = p.x;
    if (p.z < gMinZ) gMinZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.z > maxZ) maxZ = p.z;
  }
  gMinX -= CELL; gMinZ -= CELL;
  gNX = Math.ceil((maxX - gMinX) / CELL) + 2;
  gNZ = Math.ceil((maxZ - gMinZ) / CELL) + 2;
  buckets.length = gNX * gNZ;
  for (let i = 0; i < SAMPLES; i++) {
    const cx = Math.floor((centerline[i].x - gMinX) / CELL);
    const cz = Math.floor((centerline[i].z - gMinZ) / CELL);
    const key = cz * gNX + cx;
    (buckets[key] || (buckets[key] = [])).push(i);
  }
}

const FAR = { t: 0, x: 0, z: 0, y: 0, tx: 1, tz: 0, nx: 0, nz: 1, k: 0, dist: Infinity, offset: Infinity };

/**
 * Closest point on the racing centerline to a world (x, z).
 * `offset` is the signed lateral distance: positive on the left-hand side of the direction of
 * travel, which is what the barrier clamp and the building frontage placement both work in.
 * Pass `maxDist` to bail out early — far-away callers (city layout) only care whether the point
 * is clear of the road, not how far past it they are.
 */
export function nearestOnTrack(x, z, maxDist = Infinity) {
  const qx = Math.floor((x - gMinX) / CELL), qz = Math.floor((z - gMinZ) / CELL);
  let bestI = -1, bestD2 = Infinity;
  const hardCap = gNX + gNZ + Math.abs(qx) + Math.abs(qz) + 4;

  for (let k = 0; k <= hardCap; k++) {
    // every cell at ring k lies at least (k-1) cells away, so once that exceeds the current best
    // (or the caller's cutoff) no further ring can improve on it
    const lower = (k - 1) * CELL;
    if (lower > maxDist) break;
    if (bestI >= 0 && lower * lower > bestD2) break;

    for (let dz = -k; dz <= k; dz++) {
      const cz = qz + dz;
      if (cz < 0 || cz >= gNZ) continue;
      const onEdgeRow = Math.abs(dz) === k;
      for (let dx = -k; dx <= k; dx++) {
        if (!onEdgeRow && Math.abs(dx) !== k) continue;
        const cx = qx + dx;
        if (cx < 0 || cx >= gNX) continue;
        const list = buckets[cz * gNX + cx];
        if (!list) continue;
        for (const i of list) {
          const p = centerline[i];
          const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d2 < bestD2) { bestD2 = d2; bestI = i; }
        }
      }
    }
  }
  if (bestI < 0 || Math.sqrt(bestD2) > maxDist + TRACK.sampleSpacing) return FAR;

  // refine: project onto the two polyline segments meeting at the winning sample, so the result is
  // continuous rather than snapping between discrete samples (the barrier clamp needs that)
  let bU = 0, bJ = bestI, bD2 = Infinity;
  for (const j of [bestI - 1, bestI]) {
    const a = centerline[(j + SAMPLES) % SAMPLES];
    const b = centerline[(j + 1 + SAMPLES) % SAMPLES];
    const ex = b.x - a.x, ez = b.z - a.z;
    const len2 = ex * ex + ez * ez;
    let u = len2 > 0 ? ((x - a.x) * ex + (z - a.z) * ez) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d2 = (x - (a.x + ex * u)) ** 2 + (z - (a.z + ez * u)) ** 2;
    if (d2 < bD2) { bD2 = d2; bU = u; bJ = j; }
  }

  const t = ((((bJ + SAMPLES) % SAMPLES) + bU) / SAMPLES) % 1;
  const p = poseAt(t);
  const nx = -p.tz, nz = p.tx;
  return {
    t, x: p.x, z: p.z, y: elevationAt(t), tx: p.tx, tz: p.tz, nx, nz, k: p.k,
    dist: Math.hypot(x - p.x, z - p.z),
    offset: (x - p.x) * nx + (z - p.z) * nz,
  };
}
