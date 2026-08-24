// Synthesized engine note (two detuned saws through a lowpass, stepped through a simple gear
// model so it revs and "shifts" instead of sliding one flat pitch), a tire-squeal noise layer,
// and a short impact thump for traffic collisions. No audio files — everything is WebAudio synthesis.

import { CAR_PHYSICS } from './config.js';

const GEAR_BREAKPOINTS = [0, 0.1, 0.22, 0.38, 0.58, 0.8, 1.001];

let audioCtx, engineOsc1, engineOsc2, engineFilter, engineGain;
let squealSource, squealFilter, squealGain;
let compressor;

export function startAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  compressor = audioCtx.createDynamicsCompressor();
  compressor.connect(audioCtx.destination);

  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.Q.value = 0.7;
  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0;
  engineFilter.connect(engineGain).connect(compressor);

  engineOsc1 = audioCtx.createOscillator();
  engineOsc1.type = 'sawtooth';
  engineOsc2 = audioCtx.createOscillator();
  engineOsc2.type = 'sawtooth';
  engineOsc2.detune.value = 9;
  engineOsc1.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineOsc1.frequency.value = engineOsc2.frequency.value = 90;
  engineOsc1.start();
  engineOsc2.start();

  const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  squealSource = audioCtx.createBufferSource();
  squealSource.buffer = noiseBuffer;
  squealSource.loop = true;
  squealFilter = audioCtx.createBiquadFilter();
  squealFilter.type = 'bandpass';
  squealFilter.frequency.value = 1900;
  squealFilter.Q.value = 5;
  squealGain = audioCtx.createGain();
  squealGain.gain.value = 0;
  squealSource.connect(squealFilter).connect(squealGain).connect(compressor);
  squealSource.start();
}

export function playImpactThump() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.22, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc.connect(g).connect(compressor);
  osc.start(now);
  osc.stop(now + 0.24);
}

export function updateAudio({ running, speed, offTrack, throttle, turning }) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const speedRatio = Math.min(1, Math.abs(speed) / CAR_PHYSICS.maxSpeed);

  let gear = 0;
  while (gear < GEAR_BREAKPOINTS.length - 2 && speedRatio >= GEAR_BREAKPOINTS[gear + 1]) gear++;
  const gearSpan = GEAR_BREAKPOINTS[gear + 1] - GEAR_BREAKPOINTS[gear];
  const revFrac = gearSpan > 0 ? Math.min(1, (speedRatio - GEAR_BREAKPOINTS[gear]) / gearSpan) : 0;

  const freq = 85 + revFrac * 260 + gear * 12;
  engineOsc1.frequency.setTargetAtTime(freq, now, 0.05);
  engineOsc2.frequency.setTargetAtTime(freq, now, 0.05);

  const cutoff = 350 + revFrac * 1800 + (throttle ? 500 : 0);
  engineFilter.frequency.setTargetAtTime(cutoff, now, 0.08);

  const targetGain = running ? 0.05 + revFrac * 0.09 + (throttle ? 0.03 : 0) : 0;
  engineGain.gain.setTargetAtTime(targetGain, now, 0.1);

  const sliding = running && ((offTrack && Math.abs(speed) > 3) || (turning && Math.abs(speed) > CAR_PHYSICS.maxSpeed * 0.55));
  const squealTarget = sliding ? 0.09 : 0;
  squealGain.gain.setTargetAtTime(squealTarget, now, squealTarget > 0 ? 0.03 : 0.15);
}
