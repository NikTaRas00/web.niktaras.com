// Heightfield terrain: rolling countryside (fBm noise) that the track is cut into. Near the
// road the ground height is pulled to match the road surface (minus a small embed depth so the
// pavement reads as sitting in a cut); farther out it blends smoothly into pure noise hills.

import * as THREE from 'three';
import { TRACK, TERRAIN } from './config.js';
import { nearestCenterlinePoint } from './track.js';
import { fbm2D } from './noise.js';
import { makeGrassTexture } from './textures.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function naturalHeight(x, z) {
  const n = fbm2D(x * TERRAIN.hillScale, z * TERRAIN.hillScale, {
    octaves: TERRAIN.hillOctaves, lacunarity: TERRAIN.hillLacunarity, gain: TERRAIN.hillGain,
  });
  return (n - 0.5) * 2 * TERRAIN.hillAmplitude;
}

// stride: see nearestCenterlinePoint — pass a larger stride for the bulk mesh bake.
export function terrainHeight(x, z, stride = 1) {
  const { point, dist } = nearestCenterlinePoint(x, z, stride);
  const edgeDist = dist - TRACK.roadWidth / 2;
  const natural = naturalHeight(x, z);
  if (edgeDist <= 0) return point.y - TERRAIN.roadBedDepth;
  const blend = smoothstep(0, TERRAIN.blendDist, edgeDist);
  return point.y * (1 - blend) + natural * blend;
}

export function slopeAt(x, z, heading, sampleDist = 1.6) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const rx = Math.cos(heading), rz = -Math.sin(heading);
  const hF1 = terrainHeight(x + fx * sampleDist, z + fz * sampleDist);
  const hF2 = terrainHeight(x - fx * sampleDist, z - fz * sampleDist);
  const hR1 = terrainHeight(x + rx * sampleDist, z + rz * sampleDist);
  const hR2 = terrainHeight(x - rx * sampleDist, z + -rz * sampleDist);
  const pitch = Math.atan2(hF1 - hF2, 2 * sampleDist);
  const roll = Math.atan2(hR2 - hR1, 2 * sampleDist);
  return { pitch, roll };
}

export function buildTerrainMesh() {
  const size = TERRAIN.groundSize;
  const seg = TERRAIN.meshSegments;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassCol = new THREE.Color(0x3d7a3f);
  const rockCol = new THREE.Color(0x8a8378);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z, TERRAIN.genStride);
    pos.setY(i, h);

    // rough slope estimate for grass/rock vertex-color blending, cheap reuse of neighbor noise
    const hx = terrainHeight(x + 3, z, TERRAIN.genStride);
    const hz = terrainHeight(x, z + 3, TERRAIN.genStride);
    const slope = (Math.abs(h - hx) + Math.abs(h - hz)) / 3;
    const rockFactor = smoothstep(0.35, 1.6, slope);
    const col = grassCol.clone().lerp(rockCol, rockFactor);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // fine surface grain from a tiled detail texture, tinted per-vertex by the grass/rock blend above
  const detailTex = makeGrassTexture(size);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTex, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true; // lets hills shadow the valleys/road below them
  return mesh;
}
