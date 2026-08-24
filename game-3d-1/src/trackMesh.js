// Builds the visible road surface: asphalt ribbon, red/white curbs, dashed centerline, and the
// start/finish line — all following the track's elevation profile from track.js.

import * as THREE from 'three';
import { TRACK } from './config.js';
import { centerAt, tangentAt, elevationAt, SAMPLES, TOTAL_LEN } from './track.js';
import { makeAsphaltTexture } from './textures.js';

const ROAD_W = TRACK.roadWidth;
const CURB_W = TRACK.curbWidth;

// yOffset is a small delta above the local track elevation (not an absolute height), so ribbons
// follow the slope instead of sitting at a fixed world y.
function buildRibbon({ innerOffset, outerOffset, material, colorFn, yOffset = 0.02 }) {
  const geo = new THREE.BufferGeometry();
  const positions = [], uvs = [], colors = [], indices = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i % SAMPLES) / SAMPLES;
    const c = centerAt(t);
    const tan = tangentAt(t);
    const y = elevationAt(t) + yOffset;
    const nx = -tan.z, nz = tan.x;
    const ix = c.x + nx * innerOffset, iz = c.z + nz * innerOffset;
    const ox = c.x + nx * outerOffset, oz = c.z + nz * outerOffset;
    positions.push(ix, y, iz, ox, y, oz);
    const u = (i / SAMPLES) * TOTAL_LEN; // meters traveled — texture.repeat controls tile size
    uvs.push(u, 0, u, 1);
    if (colorFn) {
      const col = colorFn(i);
      colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
    }
  }
  for (let i = 0; i < SAMPLES; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colorFn) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function buildTrackMeshes(scene) {
  const asphaltTex = makeAsphaltTexture();
  const road = buildRibbon({
    innerOffset: -ROAD_W / 2,
    outerOffset: ROAD_W / 2,
    material: new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.05 }),
  });
  scene.add(road);

  const RED = new THREE.Color(0xd6432f), WHITE = new THREE.Color(0xf2f2f2);
  const samplesPerCurbBand = Math.max(1, Math.round((SAMPLES * TRACK.curbBandLen) / TOTAL_LEN));
  const curbColorFn = (i) => (Math.floor(i / samplesPerCurbBand) % 2 === 0 ? RED : WHITE);
  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });

  scene.add(buildRibbon({ innerOffset: ROAD_W / 2, outerOffset: ROAD_W / 2 + CURB_W, material: curbMat, colorFn: curbColorFn, yOffset: 0.03 }));
  scene.add(buildRibbon({ innerOffset: -ROAD_W / 2 - CURB_W, outerOffset: -ROAD_W / 2, material: curbMat, colorFn: curbColorFn, yOffset: 0.03 }));

  // dashed centerline via one InstancedMesh
  const dashGeo = new THREE.BoxGeometry(0.35, 0.02, 2.2);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
  const dashCount = Math.round(TOTAL_LEN / 5);
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < dashCount; i++) {
      const t = i / dashCount;
      const c = centerAt(t);
      const tan = tangentAt(t);
      const ry = Math.atan2(tan.x, tan.z);
      m.makeRotationY(ry);
      m.setPosition(c.x, elevationAt(t) + 0.04, c.z);
      dashMesh.setMatrixAt(i, m);
    }
  }
  dashMesh.castShadow = false;
  scene.add(dashMesh);

  // start/finish line — geometry pre-flattened so only a single Y rotation is needed to orient it
  {
    const c = centerAt(0), tan = tangentAt(0);
    const ry = Math.atan2(tan.x, tan.z);
    const lineGeo = new THREE.PlaneGeometry(ROAD_W, 2.4);
    lineGeo.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    line.rotation.y = ry; // plane's local X (its ROAD_W-wide edge) ends up perpendicular to the tangent
    line.position.set(c.x, elevationAt(0) + 0.035, c.z);
    line.receiveShadow = true;
    scene.add(line);
  }
}
