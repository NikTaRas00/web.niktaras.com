// The city floor: one large tarmac plane. Near the circuit it holds the road's own height (so the
// pavement, kerbs and barriers all sit on matching ground); farther out it ramps to a flat datum
// that the surrounding blocks are built on.
//
// The old countryside build let a coarse noise heightfield run right up under the road, and its
// grid quads cut through the tarmac wherever they disagreed — that's what the green shards poking
// through the track were. Here the flat corridor extends well past the barrier line before any
// blend starts, so no ground triangle adjacent to the circuit can cross the racing surface.

import * as THREE from 'three';
import { GROUND } from './config.js';
import { nearestOnTrack } from './track.js';
import { valueNoise2D } from './noise.js';
import { makeStreetTexture } from './textures.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const QUERY_RANGE = GROUND.flatRadius + GROUND.blendDist + 2;

/** Ground height under any world (x, z) — used for the mesh bake and for seating buildings. */
export function surfaceHeightAt(x, z) {
  const n = nearestOnTrack(x, z, QUERY_RANGE);
  if (!isFinite(n.dist)) return GROUND.baseY;
  const road = n.y - GROUND.bedDepth;
  const edge = n.dist - GROUND.flatRadius;
  if (edge <= 0) return road;
  const b = smoothstep(0, GROUND.blendDist, edge);
  return road * (1 - b) + GROUND.baseY * b;
}

export function buildGround() {
  const { size, segments } = GROUND;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  // UV in meters, matching the swept road ribbons, so the street texture's 1/tile-size repeat
  // means the same thing here as it does there
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, surfaceHeightAt(x, z));
    // broad tonal drift so a plane this size doesn't read as one flat swatch of grey; this
    // modulates the texture rather than replacing it, so it stays near 1.0
    const v = 0.82 + 0.18 * valueNoise2D(x * 0.008, z * 0.008);
    colors[i * 3] = v * 0.99;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v * 1.03;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, map: makeStreetTexture(9), roughness: 0.96, metalness: 0.02,
  }));
  mesh.receiveShadow = true;   // long building shadows across the streets are most of the mood
  mesh.castShadow = false;     // it's the floor; nothing is under it
  return mesh;
}
