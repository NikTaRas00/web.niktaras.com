// Trees and rocks scattered across the terrain using InstancedMesh — two draw calls for
// hundreds of trees instead of one draw call per tree, which is what actually lets a "gigantic"
// map stay at 60fps.

import * as THREE from 'three';
import { TERRAIN, TRACK } from './config.js';
import { nearestCenterlinePoint } from './track.js';
import { terrainHeight, naturalHeight } from './terrain.js';

const trunkGeo = new THREE.CylinderGeometry(0.25, 0.32, 2.2, 6);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
const leavesGeo = new THREE.ConeGeometry(1.6, 3.4, 8);
const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2c6b34, roughness: 1 });
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95, flatShading: true });

export function buildScenery(scene) {
  const spread = TERRAIN.groundSize * 0.85;
  const treeCount = 550;
  const rockCount = 160;

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const leaves = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount);
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < treeCount && guard < treeCount * 6) {
    guard++;
    const x = (Math.random() - 0.5) * spread;
    const z = (Math.random() - 0.5) * spread;
    const { dist } = nearestCenterlinePoint(x, z, 2);
    if (dist < TRACK.roadWidth / 2 + 9) continue;
    const y = terrainHeight(x, z, 2);
    const s = 0.7 + Math.random() * 0.9;
    const ry = Math.random() * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(0, ry, 0));

    scaleV.setScalar(s);
    m.compose(new THREE.Vector3(x, y + 1.1 * s, z), q, scaleV);
    trunks.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, y + 3.4 * s, z), q, scaleV);
    leaves.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = leaves.count = placed;
  scene.add(trunks, leaves);

  // rocks favor steeper ground, echoing real hillside scree
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.castShadow = rocks.receiveShadow = true;
  let rPlaced = 0, rGuard = 0;
  while (rPlaced < rockCount && rGuard < rockCount * 8) {
    rGuard++;
    const x = (Math.random() - 0.5) * spread;
    const z = (Math.random() - 0.5) * spread;
    const { dist } = nearestCenterlinePoint(x, z, 2);
    if (dist < TRACK.roadWidth / 2 + 6) continue;
    const h = naturalHeight(x, z);
    const hx = naturalHeight(x + 3, z), hz = naturalHeight(x, z + 3);
    const slope = (Math.abs(h - hx) + Math.abs(h - hz)) / 3;
    if (slope < 0.5 && Math.random() > 0.15) continue; // mostly keep to slopes, a few on flats
    const y = terrainHeight(x, z, 2);
    const s = 0.5 + Math.random() * 1.6;
    q.setFromEuler(new THREE.Euler(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6));
    scaleV.set(s, s * (0.6 + Math.random() * 0.5), s);
    m.compose(new THREE.Vector3(x, y + s * 0.3, z), q, scaleV);
    rocks.setMatrixAt(rPlaced, m);
    rPlaced++;
  }
  rocks.count = rPlaced;
  scene.add(rocks);
}
