// Shared car factory — used for both the player and every traffic car, so they read as the
// same "kind of thing" in the world. Paint uses a clearcoat physical material for a real
// automotive-paint look under the IBL environment set up in environment.js.

import * as THREE from 'three';
import { makeCarPaintNormal } from './textures.js';

let sharedClearcoatNormal = null;
function clearcoatNormal() {
  if (!sharedClearcoatNormal) sharedClearcoatNormal = makeCarPaintNormal();
  return sharedClearcoatNormal;
}

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 18);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.75, metalness: 0.1 });
const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.36, 10);
const hubMat = new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.35, metalness: 0.8 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0e1620, roughness: 0.05, metalness: 0.1, transmission: 0.55, thickness: 0.3 });

export function buildCar({ color = 0xe8432f, kind = 'sedan' } = {}) {
  const car = new THREE.Group();
  const big = kind === 'suv';

  const bodyGeo = big ? new THREE.BoxGeometry(2.05, 0.85, 4.3) : new THREE.BoxGeometry(1.9, 0.55, 3.8);
  const paint = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.35, metalness: 0.65,
    clearcoat: 1, clearcoatRoughness: 0.08,
    clearcoatNormalMap: clearcoatNormal(),
    clearcoatNormalScale: new THREE.Vector2(0.4, 0.4),
  });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = big ? 0.75 : 0.55;
  body.castShadow = true;
  body.receiveShadow = true;

  const cabinGeo = big ? new THREE.BoxGeometry(1.6, 0.75, 2.6) : new THREE.BoxGeometry(1.35, 0.5, 1.9);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, big ? 1.5 : 1.02, -0.15);
  cabin.castShadow = true;

  const wheelPositions = big
    ? [[1.05, 0.5, 1.55], [-1.05, 0.5, 1.55], [1.05, 0.5, -1.55], [-1.05, 0.5, -1.55]]
    : [[0.95, 0.42, 1.25], [-0.95, 0.42, 1.25], [0.95, 0.42, -1.25], [-0.95, 0.42, -1.25]];
  const wheels = wheelPositions.map(([x, y, z]) => {
    const w = new THREE.Group();
    // steer first, then spin about the (already steered) axle
    w.rotation.order = 'YXZ';
    const tire = new THREE.Mesh(wheelGeo, wheelMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.castShadow = true;
    w.add(tire, hub);
    w.position.set(x, y, z);
    return w;
  });

  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xffe9a3, emissiveIntensity: 1.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330806, emissive: 0xdd1408, emissiveIntensity: 1.4 });
  const lampGeo = new THREE.BoxGeometry(0.28, 0.16, 0.08);
  const zFront = big ? 2.16 : 1.92, zBack = big ? -2.16 : -1.92;
  const headL = new THREE.Mesh(lampGeo, headMat); headL.position.set(0.6, 0.65, zFront);
  const headR = new THREE.Mesh(lampGeo, headMat); headR.position.set(-0.6, 0.65, zFront);
  const tailL = new THREE.Mesh(lampGeo, tailMat); tailL.position.set(0.65, 0.65, zBack);
  const tailR = new THREE.Mesh(lampGeo, tailMat); tailR.position.set(-0.65, 0.65, zBack);

  car.add(body, cabin, headL, headR, tailL, tailR, ...wheels);
  car.userData.wheels = wheels;
  return car;
}

export const CAR_COLORS = [0xe8432f, 0x2f6fe0, 0xe0c92f, 0x2fa85a, 0xd9d9d9, 0x2a2a30, 0x8f3fd6, 0xff8a1f];
