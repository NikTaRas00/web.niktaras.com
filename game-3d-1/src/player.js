import * as THREE from 'three';
import { CAR_PHYSICS, TRACK } from './config.js';
import { poseAt, elevationAt, gradeAt, nearestOnTrack } from './track.js';
import { buildCar } from './car.js';
import { throttleDown, brakeDown, leftDown, rightDown } from './input.js';

const ROAD_HALF = TRACK.roadWidth / 2;
// the barrier line, pulled in by half a car so the bodywork stops against it rather than in it
const WALL_HALF = TRACK.corridorHalf - TRACK.barrierWidth - 1.05;
const RIDE_HEIGHT = 0.03;

export function createPlayer(scene) {
  const car = buildCar({ color: 0xe8432f });
  car.rotation.order = 'YXZ'; // yaw (heading) applied first, then pitch/roll relative to it
  scene.add(car);
  const [frontL, frontR] = car.userData.wheels;

  const state = {
    x: 0, y: 0, z: 0, heading: 0, speed: 0,
    lap: 1, lastT: 0, raceStart: 0, lapStart: 0, best: null,
    offTrack: false, scraping: false, running: false, odo: 0,
  };

  function placeAt(t) {
    const p = poseAt(t);
    state.x = p.x;
    state.z = p.z;
    state.y = elevationAt(t) + RIDE_HEIGHT;
    state.heading = Math.atan2(p.tx, p.tz);
    state.speed = 0;
    state.offTrack = false;
    state.scraping = false;
    car.position.set(state.x, state.y, state.z);
    car.rotation.set(0, state.heading, 0);
  }

  function resetToStart() {
    placeAt(0);
    state.lastT = 0; // avoid a false lap-complete if reset happens near the finish line
  }

  // 'R' recovers the car where it stands rather than at the line, so a spin doesn't cost the lap
  function respawn() {
    const n = nearestOnTrack(state.x, state.z);
    placeAt(isFinite(n.dist) ? n.t : 0);
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
    // classification carries over from the frame that measured it
    if (state.offTrack) {
      const decel = CAR_PHYSICS.sidewalkDrag * delta;
      state.speed = state.speed > 0 ? Math.max(0, state.speed - decel) : Math.min(0, state.speed + decel);
    }
    state.speed = Math.max(CAR_PHYSICS.maxReverse, Math.min(CAR_PHYSICS.maxSpeed, state.speed));

    const speedRatio = state.speed / CAR_PHYSICS.maxSpeed;
    const turnDir = (left ? 1 : 0) - (right ? 1 : 0);
    // grip bleeds off with speed: flat out the car simply won't rotate tightly enough for a
    // hairpin, so the slow corners have to be braked for
    const turnRate = CAR_PHYSICS.maxTurnRate * (1 - CAR_PHYSICS.turnFalloff * Math.min(1, Math.abs(speedRatio)));
    if (Math.abs(state.speed) > 0.3) {
      state.heading += turnDir * turnRate * delta * Math.sign(state.speed)
        * Math.min(1, Math.abs(speedRatio) * 1.6 + 0.25);
    }

    state.x += Math.sin(state.heading) * state.speed * delta;
    state.z += Math.cos(state.heading) * state.speed * delta;
    state.odo += Math.abs(state.speed) * delta;

    // resolve against the street: clamp the lateral offset to the barrier line, then rebuild the
    // world position from the clamped offset so longitudinal progress is untouched
    const n = nearestOnTrack(state.x, state.z);
    let offset = n.offset;
    state.scraping = false;
    if (offset > WALL_HALF || offset < -WALL_HALF) {
      offset = Math.max(-WALL_HALF, Math.min(WALL_HALF, offset));
      state.scraping = Math.abs(state.speed) > 4;
      state.speed *= CAR_PHYSICS.wallScrub;
    }
    state.x = n.x + n.nx * offset;
    state.z = n.z + n.nz * offset;

    state.offTrack = Math.abs(offset) > ROAD_HALF;
    const kerbRumble = state.offTrack ? Math.sin(state.odo * 3.1) * 0.035 : 0;
    state.y = n.y + (state.offTrack ? TRACK.sidewalkHeight : 0) + RIDE_HEIGHT + kerbRumble;

    // pitch with the road grade, scaled by how squarely the car is pointed along it
    const alignment = Math.sin(state.heading) * n.tx + Math.cos(state.heading) * n.tz;
    const pitch = -Math.atan(gradeAt(n.t) * alignment);
    const roll = turnDir * Math.abs(speedRatio) * 0.09; // body leans to the outside of the corner

    car.position.set(state.x, state.y, state.z);
    car.rotation.set(pitch, state.heading, roll);
    for (const w of car.userData.wheels) w.rotation.x -= state.speed * delta * 1.6;
    frontL.rotation.y = frontR.rotation.y = turnDir * 0.34;

    let lapComplete = false;
    if (state.lastT > 0.85 && n.t < 0.15) lapComplete = true;
    state.lastT = n.t;

    return { lapComplete, turnDir, throttle };
  }

  const camTarget = new THREE.Vector3(state.x, state.y + 8, state.z + 10);
  const lookTarget = new THREE.Vector3(state.x, state.y + 1, state.z);
  const forward = new THREE.Vector3();
  const scratch = new THREE.Vector3();

  function updateCamera(camera, delta) {
    const speedRatio = Math.min(1, Math.abs(state.speed) / CAR_PHYSICS.maxSpeed);
    forward.set(Math.sin(state.heading), 0, Math.cos(state.heading));

    // the chase camera drops back and rises a little with speed
    scratch.set(state.x, state.y + 4.4 + speedRatio * 0.7, state.z)
      .addScaledVector(forward, -(9 + speedRatio * 2.4));
    camTarget.lerp(scratch, 1 - Math.pow(0.001, delta));
    camera.position.copy(camTarget);

    scratch.set(state.x, state.y + 1, state.z).addScaledVector(forward, 4);
    lookTarget.lerp(scratch, 1 - Math.pow(0.0005, delta));
    camera.lookAt(lookTarget);
  }

  return { car, state, update, resetToStart, respawn, updateCamera };
}
