// The city the circuit is cut through.
//
// Two passes build it. The first walks the centerline and lines both sides of the street with a
// continuous run of buildings at a fixed setback — that frontage is the urban canyon you actually
// race down, and it's what makes the course read as streets rather than a ribbon in a field. The
// second fills the rest of the map with a grid of background blocks so the skyline holds up when
// you look past the corners.
//
// Every building is a box (shopfront plinth + windowed body + roof parapet) merged into a handful
// of BufferGeometries by material, so several hundred of them cost a few draw calls, not several
// hundred.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, TRACK } from './config.js';
import { poseAt, elevationAt, curvatureAt, nearestOnTrack, TOTAL_LEN } from './track.js';
import { surfaceHeightAt } from './ground.js';
import { fbm2D } from './noise.js';
import { makeRng, range } from './rng.js';
import {
  FACADE_SPECS, FACADE_TILE_X, FACADE_TILE_Y, PLINTH_TILE_X,
  makeFacadeTextures, makeStorefrontTexture, makeConcreteTexture,
} from './textures.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * A box whose UVs are scaled by its own dimensions against a tile size in meters, so windows come
 * out the same physical size on a corner shop and on a tower. Carries a flat vertex colour used to
 * tint individual buildings apart once they've all been merged under one shared facade texture.
 */
function tintedBox(sizeX, sizeY, sizeZ, tileX, tileY, color) {
  const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
  const uv = geo.attributes.uv;
  // BoxGeometry lays out four verts per face in the order +X, -X, +Y, -Y, +Z, -Z
  const scaleFaces = (from, to, su, sv) => {
    for (let i = from; i < to; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  };
  scaleFaces(0, 8, sizeZ / tileX, sizeY / tileY);    // side walls span depth-wise
  scaleFaces(8, 16, sizeX / tileX, sizeZ / tileY);   // roof / underside
  scaleFaces(16, 24, sizeX / tileX, sizeY / tileY);  // street-facing facades

  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

function placed(geo, x, y, z, rotY) {
  _euler.set(0, rotY, 0);
  _quat.setFromEuler(_euler);
  _pos.set(x, y, z);
  geo.applyMatrix4(new THREE.Matrix4().compose(_pos, _quat, _scale));
  return geo;
}

/** Height from a noise field plus a radial falloff — a dense core of towers thinning to low-rise. */
function buildingHeight(x, z, rng) {
  const n = fbm2D(x * 0.0011 + 120, z * 0.0011 + 120, { octaves: 4 });
  const radial = 1 - smoothstep(120, 700, Math.hypot(x, z));
  const core = Math.pow(Math.max(0, n * 0.75 + radial * 0.45), 1.6);
  return Math.min(125, 9 + core * 82 + rng() * 8);
}

/** Rejects a footprint if any point on its perimeter comes closer than `minClear` to the circuit. */
function footprintClear(cx, cz, rotY, sizeX, sizeZ, minClear) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const hx = sizeX / 2, hz = sizeZ / 2;
  const stepsX = Math.max(2, Math.ceil(sizeX / 6));
  const stepsZ = Math.max(2, Math.ceil(sizeZ / 6));
  const test = (lx, lz) => {
    const wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
    return nearestOnTrack(wx, wz, minClear + 4).dist >= minClear;
  };
  for (let i = 0; i <= stepsX; i++) {
    const lx = -hx + (sizeX * i) / stepsX;
    if (!test(lx, -hz) || !test(lx, hz)) return false;
  }
  for (let j = 0; j <= stepsZ; j++) {
    const lz = -hz + (sizeZ * j) / stepsZ;
    if (!test(-hx, lz) || !test(hx, lz)) return false;
  }
  return true;
}

export function buildCity(scene) {
  const rng = makeRng(CITY.seed);

  const facades = FACADE_SPECS.map((spec) => ({ tex: makeFacadeTextures(spec, rng), geos: [] }));
  const plinthGeos = [], concreteGeos = [];

  function addBuilding(cx, cz, rotY, sizeX, sizeZ, height) {
    const base = surfaceHeightAt(cx, cz) - 1.2;   // sunk slightly so no gap shows on sloping ground
    const plinthH = Math.min(4.6, height * 0.35);
    const bodyH = height - plinthH;

    const shade = 0.82 + rng() * 0.3;
    const warm = 0.955 + rng() * 0.09;
    const tint = new THREE.Color(shade * warm, shade, shade * (1.96 - warm));

    const variant = facades[Math.floor(rng() * facades.length)];
    variant.geos.push(placed(
      tintedBox(sizeX, bodyH, sizeZ, FACADE_TILE_X, FACADE_TILE_Y, tint),
      cx, base + plinthH + bodyH / 2, cz, rotY,
    ));

    // street-level shopfronts, stepped proud of the body so the base reads as a separate storey
    plinthGeos.push(placed(
      tintedBox(sizeX + 0.35, plinthH, sizeZ + 0.35, PLINTH_TILE_X, plinthH, tint),
      cx, base + plinthH / 2, cz, rotY,
    ));

    const roofTint = new THREE.Color(0.88, 0.88, 0.86);
    concreteGeos.push(placed(
      tintedBox(sizeX + 0.6, 1.1, sizeZ + 0.6, 4, 4, roofTint),
      cx, base + height + 0.55, cz, rotY,
    ));
    if (height > 45) {   // rooftop plant, cheap skyline detail
      concreteGeos.push(placed(
        tintedBox(sizeX * 0.45, 5, sizeZ * 0.45, 4, 4, roofTint),
        cx, base + height + 3.6, cz, rotY,
      ));
    }
  }

  buildFrontage(rng, addBuilding);
  buildBlocks(rng, addBuilding, concreteGeos);

  const commit = (geos, material) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  for (const v of facades) {
    commit(v.geos, new THREE.MeshStandardMaterial({
      map: v.tex.map,
      emissiveMap: v.tex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.15,
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.16,
    }));
  }
  commit(plinthGeos, new THREE.MeshStandardMaterial({
    map: makeStorefrontTexture(rng), vertexColors: true, roughness: 0.5, metalness: 0.15,
  }));
  // tile size 1: tintedBox already emits UVs in tiles rather than in meters the way the swept
  // road ribbons do, so the texture must not scale them a second time
  commit(concreteGeos, new THREE.MeshStandardMaterial({
    map: makeConcreteTexture(1), vertexColors: true, roughness: 0.9,
  }));

  buildStreetlights(scene);
}

/**
 * Lines both sides of the street.
 *
 * Widths are measured along the *frontage*, not the centerline: on a corner the pavement line runs
 * shorter on the inside and longer on the outside than the centerline does, by a factor of
 * (1 - k*offset) for signed curvature k. Advancing the centerline by width/that factor keeps
 * neighbouring buildings flush all the way around a corner instead of gapping and overlapping.
 */
function buildFrontage(rng, addBuilding) {
  for (const side of [1, -1]) {
    const offset = side * CITY.setback;
    let s = rng() * 30;

    while (s < TOTAL_LEN) {
      const t = (s / TOTAL_LEN) % 1;
      const k = curvatureAt(t);
      const shrink = 1 - k * offset;
      if (shrink < 0.35) { s += 4; continue; }   // inside of a tight corner: leave it open

      const turnRadius = Math.abs(k) > 1e-5 ? shrink / Math.abs(k) : Infinity;
      const maxWidth = Math.max(CITY.minWidth, Math.min(CITY.maxWidth, turnRadius * 0.5));
      const width = range(rng, CITY.minWidth, maxWidth);
      const advance = width / shrink;

      const mid = ((s + advance / 2) / TOTAL_LEN) % 1;
      const p = poseAt(mid);
      const nx = -p.tz, nz = p.tx;
      const rotY = Math.atan2(p.tx, p.tz);

      // Deepest footprint that still clears this street and any other street behind it. The back
      // face sits exactly setback+depth from its own centerline, so if anything nearer turns up
      // there it belongs to another leg and this building has pushed past the midline into the
      // frontage facing it — back off to a shallower plot instead of letting the two rows merge.
      let depth = 0;
      for (const tryDepth of CITY.depthTries) {
        const backLateral = offset + side * tryDepth;
        const back = nearestOnTrack(p.x + nx * backLateral, p.z + nz * backLateral, CITY.setback + tryDepth + 2);
        if (isFinite(back.dist) && back.dist < CITY.setback + tryDepth - 1.5) continue;

        const lateral = offset + side * tryDepth / 2;
        const cx = p.x + nx * lateral, cz = p.z + nz * lateral;
        if (footprintClear(cx, cz, rotY, tryDepth, width, CITY.minClear)) { depth = tryDepth; break; }
      }
      if (depth === 0) { s += advance + 3; continue; }

      const lateral = offset + side * depth / 2;
      const cx = p.x + nx * lateral, cz = p.z + nz * lateral;
      addBuilding(cx, cz, rotY, depth, width, buildingHeight(cx, cz, rng));

      s += advance;
      if (rng() < CITY.gapChance) s += range(rng, CITY.gapRange[0], CITY.gapRange[1]);
    }
  }
}

/** Background blocks on a street grid, each a raised pavement slab carrying up to four buildings. */
function buildBlocks(rng, addBuilding, concreteGeos) {
  const [padW, padD] = CITY.blockPad;
  const half = CITY.extent / 2;
  const lots = 2;

  for (let bx = -half; bx <= half; bx += CITY.blockPitch) {
    for (let bz = -half; bz <= half; bz += CITY.blockPitch) {
      const cx0 = bx + (rng() - 0.5) * 14, cz0 = bz + (rng() - 0.5) * 14;
      if (nearestOnTrack(cx0, cz0, CITY.blockKeepOut).dist < CITY.blockKeepOut) continue;

      const padY = surfaceHeightAt(cx0, cz0);
      concreteGeos.push(placed(
        tintedBox(padW, 0.22, padD, 4, 4, new THREE.Color(0.9, 0.89, 0.86)),
        cx0, padY + 0.05, cz0, 0,
      ));

      for (let lx = 0; lx < lots; lx++) {
        for (let lz = 0; lz < lots; lz++) {
          if (rng() < 0.15) continue;   // an empty lot here and there: car parks, yards
          const cellW = padW / lots, cellD = padD / lots;
          const cx = cx0 + (lx + 0.5 - lots / 2) * cellW;
          const cz = cz0 + (lz + 0.5 - lots / 2) * cellD;
          const sizeX = (cellW - 10) * (0.72 + rng() * 0.28);
          const sizeZ = (cellD - 10) * (0.72 + rng() * 0.28);
          if (!footprintClear(cx, cz, 0, sizeX, sizeZ, CITY.minClear)) continue;
          addBuilding(cx, cz, 0, sizeX, sizeZ, buildingHeight(cx, cz, rng));
        }
      }
    }
  }
}

/** Lamp posts down the pavement, alternating sides, arms reaching out over the racing surface. */
function buildStreetlights(scene) {
  const count = Math.floor(TOTAL_LEN / CITY.lampSpacing);
  const pole = new THREE.CylinderGeometry(0.13, 0.18, 9, 8);
  pole.translate(0, 4.5, 0);
  const arm = new THREE.BoxGeometry(0.14, 0.14, 2.8);
  arm.translate(0, 8.85, 1.3);
  const metal = new THREE.InstancedMesh(
    mergeGeometries([pole, arm]),
    new THREE.MeshStandardMaterial({ color: 0x2f353c, roughness: 0.55, metalness: 0.6 }),
    count,
  );
  const lampGeo = new THREE.BoxGeometry(0.5, 0.22, 0.9);
  lampGeo.translate(0, 8.62, 2.5);
  const lamps = new THREE.InstancedMesh(
    lampGeo,
    new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffdf9e, emissiveIntensity: 1.3 }),
    count,
  );

  const m = new THREE.Matrix4();
  const lateral = TRACK.corridorHalf - 2.4;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const p = poseAt(t);
    const side = i % 2 === 0 ? 1 : -1;
    const nx = -p.tz, nz = p.tx;
    // face the arm inward, across the street
    m.makeRotationY(Math.atan2(side * p.tz, -side * p.tx));
    m.setPosition(
      p.x + nx * side * lateral,
      elevationAt(t) + TRACK.sidewalkHeight,
      p.z + nz * side * lateral,
    );
    metal.setMatrixAt(i, m);
    lamps.setMatrixAt(i, m);
  }
  metal.castShadow = true;
  scene.add(metal, lamps);
}
