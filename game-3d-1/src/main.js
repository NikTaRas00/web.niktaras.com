import * as THREE from 'three';
import { setupEnvironment } from './environment.js';
import { setupPostFX } from './postfx.js';
import { buildTerrainMesh } from './terrain.js';
import { buildTrackMeshes } from './trackMesh.js';
import { buildScenery } from './scenery.js';
import { createPlayer } from './player.js';
import { createTraffic } from './traffic.js';
import { initInput } from './input.js';
import * as audio from './audio.js';
import * as hud from './hud.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const env = setupEnvironment(scene, renderer);
const { composer, onResize } = setupPostFX(renderer, scene, camera);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  onResize();
});

initInput();

hud.showLoading();

// yield one frame so the loading screen actually paints before the heavy synchronous
// terrain/track/scenery generation blocks the main thread
requestAnimationFrame(() => requestAnimationFrame(buildWorld));

let player, traffic;
const bestKey = 'driftloop_best_lap';

function buildWorld() {
  scene.add(buildTerrainMesh());
  buildTrackMeshes(scene);
  buildScenery(scene);

  player = createPlayer(scene);
  traffic = createTraffic(scene);

  player.state.best = parseFloat(localStorage.getItem(bestKey)) || null;
  hud.setBestDisplay(player.state.best);

  hud.initHUD({
    onStart: () => { audio.startAudio(); hud.hideStartScreen(); beginRace(); },
    onRestart: (mode) => {
      if (mode === 'soft') player.resetToStart();
      else beginRace();
    },
  });

  hud.hideLoading();
  requestAnimationFrame(frame);
}

function beginRace() {
  player.resetToStart();
  player.state.lap = 1;
  player.state.running = false;
  hud.runCountdown(() => {
    player.state.running = true;
    const now = performance.now();
    player.state.raceStart = now;
    player.state.lapStart = now;
  });
}

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min(0.05, (now - last) / 1000);
  last = now;

  const result = player.update(delta);
  traffic.update(delta);
  const hit = traffic.checkPlayerCollision(player.state);
  if (hit) audio.playImpactThump();

  if (result.lapComplete) {
    const lapTime = now - player.state.lapStart;
    if (player.state.best == null || lapTime < player.state.best) {
      player.state.best = lapTime;
      localStorage.setItem(bestKey, String(lapTime));
      hud.setBestDisplay(player.state.best);
    }
    player.state.lapStart = now;
    player.state.lap += 1;
  }

  player.updateCamera(camera, delta);
  env.followTarget(player.state.x, player.state.y, player.state.z);

  audio.updateAudio({
    running: player.state.running,
    speed: player.state.speed,
    offTrack: player.state.offTrack,
    throttle: !!result.throttle,
    turning: !!result.turnDir,
  });

  if (player.state.running) {
    hud.updateHUD({
      lap: player.state.lap,
      lapElapsedMs: now - player.state.lapStart,
      speedKmh: Math.round(Math.abs(player.state.speed) * 3.6),
      offTrack: player.state.offTrack,
    });
  }

  composer.render();
}
