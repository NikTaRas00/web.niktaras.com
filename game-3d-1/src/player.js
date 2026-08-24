import * as THREE from 'three';
import { CAR_PHYSICS, TRACK as TRACK_CFG } from './config.js';
import { centerAt, tangentAt, elevationAt, nearestCenterlinePoint } from './track.js';
import { terrainHeight, slopeAt } from './terrain.js';
import { buildCar } from './car.js';
import { throttleDown, brakeDown, leftDown, rightDown } from './input.js';

const ROAD_W = TRACK_CFG.roadWidth;

export function createPlayer(scene) {
  const car = buildCar({ color: 0xe8432f });
  car.rotation.order = 'YXZ'; // yaw (heading) applied first, then pitch/roll relative to it
  scene.add(car);

  const state = {
    x: 0, y: 0, z: 0, heading: 0, speed: 0,
    lap: 1, lastT: 0, raceStart: 0, lapStart: 0, best: null,
    offTrack: false, running: false,
  };

  function resetToStart() {
    const c = centerAt(0), tan = tangentAt(0);
    state.x = c.x; state.z = c.z;
    state.y = elevationAt(0);
    state.heading = Math.atan2(tan.x, tan.z);
    state.speed = 0;
    state.lastT = 0; // avoid a false lap-complete if reset happens near the finish line
    car.position.set(state.x, state.y, state.z);
    car.rotation.set(0, state.heading, 0);
  }
  resetToStart();

  function update(delta) {
    if (!state.running) return { lapComplete: false };
    const throttle = throttleDown(), brake = brakeDown(), left = leftDown(), right = rightDown();

    if (throttle) state.speed += CAR_PHYSICS.accel * delta;
    else if (brake) state.speed -= CAR_PHYSICS.brake * delta;
    else {
      const decel = CAR_PHYSICS.drag * delta;
      state.speed = state.speed > 0 ? Math.max(0, state.speed - decel) : Math.min(0, state.speed + decel);
    }

    const nearest = nearestCenterlinePoint(state.x, state.z);
    state.offTrack = nearest.dist > ROAD_W / 2;
    if (state.offTrack) {
      const decel = CAR_PHYSICS.offTrackDrag * delta;
      state.speed = state.speed > 0 ? Math.max(0, state.speed - decel) : Math.min(0, state.speed + decel);
    }
    state.speed = Math.max(CAR_PHYSICS.maxReverse, Math.min(CAR_PHYSICS.maxSpeed, state.speed));

    const speedRatio = state.speed / CAR_PHYSICS.maxSpeed;
    const turnDir = (left ? 1 : 0) - (right ? 1 : 0);
    if (Math.abs(state.speed) > 0.3) {
      state.heading += turnDir * CAR_PHYSICS.maxTurnRate * delta * Math.sign(state.speed) * Math.min(1, Math.abs(speedRatio) * 1.6 + 0.25);
    }

    state.x += Math.sin(state.heading) * state.speed * delta;
    state.z += Math.cos(state.heading) * state.speed * delta;
    state.y = terrainHeight(state.x, state.z) + 0.03;

    const { pitch, roll } = slopeAt(state.x, state.z, state.heading);
    car.position.set(state.x, state.y, state.z);
    car.rotation.set(pitch, state.heading, roll);
    for (const w of car.userData.wheels) w.rotation.x -= state.speed * delta * 1.6;

    let lapComplete = false;
    const t = nearest.point.t;
    if (state.lastT > 0.85 && t < 0.15) {
      lapComplete = true;
    }
    state.lastT = t;

    return { lapComplete, turnDir, throttle };
  }

  const camTarget = new THREE.Vector3(state.x, state.y + 8, state.z + 10);
  const lookTarget = new THREE.Vector3(state.x, state.y + 1, state.z);

  function updateCamera(camera, delta) {
    const forward = new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading));
    const desired = new THREE.Vector3(state.x, state.y, state.z)
      .sub(forward.clone().multiplyScalar(9))
      .add(new THREE.Vector3(0, 4.6, 0));
    camTarget.lerp(desired, 1 - Math.pow(0.001, delta));
    camera.position.copy(camTarget);
    lookTarget.lerp(new THREE.Vector3(state.x, state.y + 1, state.z).add(forward.clone().multiplyScalar(4)), 1 - Math.pow(0.0005, delta));
    camera.lookAt(lookTarget);
  }

  return { car, state, update, resetToStart, updateCamera };
}
