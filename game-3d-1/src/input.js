// Shared keyboard/touch state — a plain object of lowercase key names to booleans, read by
// player.js and audio.js.

export const keys = Object.create(null);

export function initInput() {
  addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
}

export function bindTouchButton(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = (e) => { e.preventDefault(); keys[key] = true; };
  const off = (e) => { e.preventDefault(); keys[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}

export const throttleDown = () => keys['w'] || keys['arrowup'];
export const brakeDown = () => keys['s'] || keys['arrowdown'];
export const leftDown = () => keys['a'] || keys['arrowleft'];
export const rightDown = () => keys['d'] || keys['arrowright'];
