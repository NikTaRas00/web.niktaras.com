// The street surface and everything bolted to it: tarmac, kerbs, pavements, Armco, lane markings,
// the start/finish line and its gantry.
//
// All of it is one operation — sweeping a 2D cross-section along the centerline — so a kerb, a
// raised pavement and a barrier are just different profiles rather than different code paths.

import * as THREE from 'three';
import { TRACK } from './config.js';
import { poseAt, elevationAt, SAMPLES, TOTAL_LEN } from './track.js';
import { makeAsphaltTexture, makeConcreteTexture, makeCheckerTexture } from './textures.js';

const ROAD_HALF = TRACK.roadWidth / 2;
const KERB_OUT = ROAD_HALF + TRACK.kerbWidth;
const WALK_OUT = TRACK.corridorHalf;                 // outer edge of the pavement / barrier line
const SW_H = TRACK.sidewalkHeight;

/**
 * Sweeps a cross-section around the closed circuit.
 * `profile` is a list of { off, dy } cross-section points ordered by increasing lateral offset,
 * with dy measured relative to the local road height. Ordering them that way keeps the winding
 * consistent, so horizontal spans face up and vertical spans face away from the road.
 * UVs are laid out in meters on both axes; each material sets its own repeat as 1 / tile-size.
 */
function sweep(profile, material, colorFn) {
  const rows = profile.length;
  const positions = [], uvs = [], colors = [], indices = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i % SAMPLES) / SAMPLES;
    const p = poseAt(t);
    const y = elevationAt(t);
    const nx = -p.tz, nz = p.tx;
    const s = (i / SAMPLES) * TOTAL_LEN;
    for (let r = 0; r < rows; r++) {
      const pr = profile[r];
      positions.push(p.x + nx * pr.off, y + pr.dy, p.z + nz * pr.off);
      uvs.push(s, pr.off);
      if (colorFn) {
        const c = colorFn(i, r);
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  for (let i = 0; i < SAMPLES; i++) {
    for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r, b = a + 1, c = (i + 1) * rows + r, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colorFn) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

// a thin flat stripe painted on the road, e.g. the solid white lane edge lines
function paintStripe(offset, width, material) {
  return sweep([{ off: offset - width / 2, dy: 0.022 }, { off: offset + width / 2, dy: 0.022 }], material);
}

export function buildTrackMeshes(scene) {
  // ---- racing surface
  const road = sweep(
    [{ off: -ROAD_HALF, dy: 0 }, { off: ROAD_HALF, dy: 0 }],
    new THREE.MeshStandardMaterial({ map: makeAsphaltTexture(6), roughness: 0.9, metalness: 0.05 }),
  );
  scene.add(road);

  // ---- kerbs (sloped face from road level up to pavement level)
  const RED = new THREE.Color(0xd6432f), WHITE = new THREE.Color(0xf2f2f2);
  const perBand = Math.max(1, Math.round((SAMPLES * TRACK.kerbBandLen) / TOTAL_LEN));
  const kerbColor = (i) => (Math.floor(i / perBand) % 2 === 0 ? RED : WHITE);
  const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  scene.add(sweep([{ off: ROAD_HALF, dy: 0.015 }, { off: KERB_OUT, dy: SW_H }], kerbMat, kerbColor));
  scene.add(sweep([{ off: -KERB_OUT, dy: SW_H }, { off: -ROAD_HALF, dy: 0.015 }], kerbMat, kerbColor));

  // ---- pavements; the outer row drops below ground level to seal the seam against the terrain
  const walkMat = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(4), roughness: 0.94 });
  scene.add(sweep([
    { off: KERB_OUT, dy: SW_H }, { off: WALK_OUT, dy: SW_H }, { off: WALK_OUT, dy: -0.7 },
  ], walkMat));
  scene.add(sweep([
    { off: -WALK_OUT, dy: -0.7 }, { off: -WALK_OUT, dy: SW_H }, { off: -KERB_OUT, dy: SW_H },
  ], walkMat));

  // ---- Armco along the pavement edge: it's what actually keeps the car in the streets
  const BW = TRACK.barrierWidth, BH = TRACK.barrierHeight;
  const B_RED = new THREE.Color(0xc4392c), B_WHITE = new THREE.Color(0xe8e8e4);
  const bandLen = Math.max(1, Math.round((SAMPLES * 10) / TOTAL_LEN));
  const barrierColor = (i) => (Math.floor(i / bandLen) % 6 === 0 ? B_RED : B_WHITE);
  const barrierMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  scene.add(sweep([
    { off: WALK_OUT - BW, dy: SW_H }, { off: WALK_OUT - BW, dy: SW_H + BH },
    { off: WALK_OUT, dy: SW_H + BH }, { off: WALK_OUT, dy: SW_H },
  ], barrierMat, barrierColor));
  scene.add(sweep([
    { off: -WALK_OUT, dy: SW_H }, { off: -WALK_OUT, dy: SW_H + BH },
    { off: -WALK_OUT + BW, dy: SW_H + BH }, { off: -WALK_OUT + BW, dy: SW_H },
  ], barrierMat, barrierColor));

  // ---- markings
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.55 });
  scene.add(paintStripe(ROAD_HALF - 0.45, 0.18, paintMat));
  scene.add(paintStripe(-ROAD_HALF + 0.45, 0.18, paintMat));

  // three dashed lane dividers across the four-lane street, as one InstancedMesh
  {
    const laneOffsets = [-ROAD_HALF / 2, 0, ROAD_HALF / 2];
    const spacing = 9;
    const perLane = Math.round(TOTAL_LEN / spacing);
    const dashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.02, 3),
      new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }),
      perLane * laneOffsets.length,
    );
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < perLane; i++) {
      const t = i / perLane;
      const p = poseAt(t);
      const y = elevationAt(t) + 0.035;
      const ry = Math.atan2(p.tx, p.tz);
      for (const off of laneOffsets) {
        m.makeRotationY(ry);
        m.setPosition(p.x + -p.tz * off, y, p.z + p.tx * off);
        dashes.setMatrixAt(n++, m);
      }
    }
    dashes.castShadow = false;
    scene.add(dashes);
  }

  buildStartLine(scene);
}

function buildStartLine(scene) {
  const p = poseAt(0);
  const y = elevationAt(0);
  const ry = Math.atan2(p.tx, p.tz);

  // checkered band across the road — geometry pre-flattened so only a Y rotation is needed
  const lineGeo = new THREE.PlaneGeometry(TRACK.roadWidth, 4);
  lineGeo.rotateX(-Math.PI / 2);
  // 8 squares per tile, repeated 4x across the road and once along it: ~0.5 m squares either way
  const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({
    map: makeCheckerTexture(8, 4, 1), roughness: 0.6,
  }));
  line.rotation.y = ry;
  line.position.set(p.x, y + 0.04, p.z);
  line.receiveShadow = true;
  scene.add(line);

  // gantry straddling the street, so start/finish reads at a glance from the cockpit
  const gantry = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.7 });
  const postGeo = new THREE.BoxGeometry(0.6, 8.4, 0.6);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, steel);
    post.position.set(side * (TRACK.corridorHalf - 0.8), 4.2, 0);
    post.castShadow = true;
    gantry.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK.corridorHalf * 2 - 1, 0.5, 0.7), steel);
  beam.position.y = 8.15;
  beam.castShadow = true;
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK.roadWidth, 1.5, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1d6f5e, emissive: 0x0d3b31, roughness: 0.6 }),
  );
  banner.position.y = 7.1;
  gantry.add(beam, banner);
  gantry.rotation.y = ry;
  gantry.position.set(p.x, y, p.z);
  scene.add(gantry);
}
