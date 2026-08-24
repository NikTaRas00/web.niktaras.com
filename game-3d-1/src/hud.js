// All DOM wiring for the HUD, start screen, countdown, loading overlay and touch controls.
// Keeps main.js free of document.getElementById plumbing.

import { bindTouchButton } from './input.js';

const lapVal = document.getElementById('lapVal');
const timeVal = document.getElementById('timeVal');
const bestVal = document.getElementById('bestVal');
const speedVal = document.getElementById('speedVal');
const offtrackEl = document.getElementById('offtrack');
const countdownEl = document.getElementById('countdown');
const startScreen = document.getElementById('startScreen');
const loadingScreen = document.getElementById('loadingScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

export function fmtTime(ms) {
  if (ms == null) return '--:--.-';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${rem}`;
}

export function showLoading() { loadingScreen.classList.remove('hidden'); }
export function hideLoading() { loadingScreen.classList.add('hidden'); }

export function initHUD({ onStart, onRestart }) {
  bindTouchButton('btnLeft', 'arrowleft');
  bindTouchButton('btnRight', 'arrowright');
  bindTouchButton('btnGas', 'arrowup');
  bindTouchButton('btnBrake', 'arrowdown');
  if ('ontouchstart' in window) document.getElementById('touchControls').classList.add('active');

  startBtn.addEventListener('click', () => onStart());
  restartBtn.addEventListener('click', () => onRestart('full'));
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') onRestart('soft');
  });
}

export function hideStartScreen() { startScreen.classList.add('hidden'); }

export function runCountdown(cb) {
  const sequence = ['3', '2', '1', 'GO!'];
  let i = 0;
  countdownEl.classList.add('show');
  const tick = () => {
    countdownEl.textContent = sequence[i];
    i++;
    if (i < sequence.length) setTimeout(tick, 700);
    else setTimeout(() => { countdownEl.classList.remove('show'); cb(); }, 500);
  };
  tick();
}

export function setBestDisplay(best) { bestVal.textContent = fmtTime(best); }

export function updateHUD({ lap, lapElapsedMs, speedKmh, offTrack }) {
  lapVal.textContent = `${lap} / ∞`;
  timeVal.textContent = fmtTime(lapElapsedMs);
  speedVal.textContent = `${speedKmh} km/h`;
  offtrackEl.classList.toggle('show', offTrack);
}
