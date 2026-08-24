// AI traffic: cars that drive the track spline in fixed lanes with simple adaptive-cruise
// following (slow down for whoever's ahead in the same lane) and a soft arcade bump against the
// player. Traffic never leaves the road, so — unlike the player — it only needs the track spline,
// not a terrain query, to know its position and grade.

import { TRAFFIC } from './config.js';
import { centerAt, tangentAt, elevationAt, TOTAL_LEN } from './track.js';
import { buildCar, CAR_COLORS } from './car.js';

function gradeAt(t) {
  const eps = 0.0006;
  const y1 = elevationAt(t - eps), y2 = elevationAt(t + eps);
  const ds = 2 * eps * TOTAL_LEN;
  return Math.atan2(y2 - y1, ds);
}

export function createTraffic(scene) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i++) {
    const lane = TRAFFIC.lanes[i % TRAFFIC.lanes.length];
    const kind = Math.random() < 0.25 ? 'suv' : 'sedan';
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const mesh = buildCar({ color, kind });
    mesh.rotation.order = 'YXZ';
    scene.add(mesh);
    const baseSpeed = TRAFFIC.speedRange[0] + Math.random() * (TRAFFIC.speedRange[1] - TRAFFIC.speedRange[0]);
    cars.push({
      mesh, lane,
      t: i / TRAFFIC.count,
      baseSpeed, speed: baseSpeed,
      collisionCooldown: 0,
    });
  }

  function update(delta) {
    for (const car of cars) {
      let aheadGap = Infinity;
      for (const other of cars) {
        if (other === car || other.lane !== car.lane) continue;
        const gapT = ((other.t - car.t) % 1 + 1) % 1;
        const gapDist = gapT * TOTAL_LEN;
        if (gapDist < aheadGap) aheadGap = gapDist;
      }
      let target = car.baseSpeed;
      if (aheadGap < TRAFFIC.safeGap) {
        const frac = Math.max(0, (aheadGap - TRAFFIC.minGap) / (TRAFFIC.safeGap - TRAFFIC.minGap));
        target = car.baseSpeed * frac;
      }
      car.speed += (target - car.speed) * Math.min(1, delta * 2.2);
      car.t = (car.t + (car.speed / TOTAL_LEN) * delta) % 1;
      if (car.t < 0) car.t += 1;

      const c = centerAt(car.t);
      const tan = tangentAt(car.t);
      const nx = -tan.z, nz = tan.x;
      const x = c.x + nx * car.lane, z = c.z + nz * car.lane;
      const y = elevationAt(car.t) + 0.03;
      const heading = Math.atan2(tan.x, tan.z);
      const pitch = gradeAt(car.t);

      car.mesh.position.set(x, y, z);
      car.mesh.rotation.set(pitch, heading, 0);
      for (const w of car.mesh.userData.wheels) w.rotation.x -= car.speed * delta * 1.6;
      car.x = x; car.z = z;

      if (car.collisionCooldown > 0) car.collisionCooldown -= delta;
    }
  }

  function checkPlayerCollision(playerState) {
    let hit = false;
    for (const car of cars) {
      const dx = playerState.x - car.x, dz = playerState.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < TRAFFIC.collisionDist && dist > 0.001) {
        const push = (TRAFFIC.collisionDist - dist);
        playerState.x += (dx / dist) * push;
        playerState.z += (dz / dist) * push;
        playerState.speed *= 0.55;
        car.speed *= 0.8;
        if (car.collisionCooldown <= 0) {
          hit = true;
          car.collisionCooldown = 0.6;
        }
      }
    }
    return hit;
  }

  return { cars, update, checkPlayerCollision };
}
