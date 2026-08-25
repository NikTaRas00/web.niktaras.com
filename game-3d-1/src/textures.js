// Procedural canvas textures — kept self-contained (no external image/CDN texture files) so the
// page never breaks from a dead asset link, at the cost of not being literal photo-scans.

import * as THREE from 'three';

function noiseCanvas({ size = 256, base, variance, dotAlpha = 0.35, dots = 2200 }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = variance[Math.floor(Math.random() * variance.length)];
    ctx.globalAlpha = dotAlpha * (0.4 + Math.random() * 0.6);
    const x = Math.random() * size, y = Math.random() * size, r = 0.6 + Math.random() * 2.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

// derive a normal map from a grayscale height reading of the canvas (cheap Sobel-ish pass)
function normalMapFromCanvas(canvas, strength = 1.4) {
  const size = canvas.width;
  const src = canvas.getContext('2d').getImageData(0, 0, size, size).data;
  const heightAt = (x, y) => {
    x = (x + size) % size; y = (y + size) % size;
    const idx = (y * size + x) * 4;
    return (src[idx] + src[idx + 1] + src[idx + 2]) / (3 * 255);
  };
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * strength;
      const ny = (heightAt(x, y - 1) - heightAt(x, y + 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const idx = (y * size + x) * 4;
      img.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[idx + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function toTexture(canvas, repeatX = 1, repeatY = repeatX, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- surfaces

// Ribbons and the ground plane both UV in meters, so the repeat is simply 1 / tile-size.
export function makeAsphaltTexture(tileMeters = 6) {
  const canvas = noiseCanvas({ base: '#33353b', variance: ['#3d4047', '#2a2c31', '#45484f', '#505459'], dots: 3000, dotAlpha: 0.28 });
  return toTexture(canvas, 1 / tileMeters);
}

// the wider city surface: same family as the racing line but greyer and dirtier, so the circuit
// still reads as freshly-laid tarmac against the streets around it
export function makeStreetTexture(tileMeters = 9) {
  const canvas = noiseCanvas({ base: '#3a3c40', variance: ['#44464b', '#313338', '#4c4f55', '#2b2d31'], dots: 2600, dotAlpha: 0.3 });
  return toTexture(canvas, 1 / tileMeters);
}

export function makeConcreteTexture(tileMeters = 4) {
  const size = 256;
  const canvas = noiseCanvas({ size, base: '#a8a49c', variance: ['#b4b0a8', '#9b978f', '#bdb9b1', '#928e87'], dots: 2000, dotAlpha: 0.22 });
  const ctx = canvas.getContext('2d');
  // paving slab joints — two lines per tile is enough to read as pavement at speed
  ctx.strokeStyle = 'rgba(60,58,54,0.45)';
  ctx.lineWidth = 2;
  for (const p of [0, 0.5]) {
    ctx.beginPath(); ctx.moveTo(p * size, 0); ctx.lineTo(p * size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p * size); ctx.lineTo(size, p * size); ctx.stroke();
  }
  return toTexture(canvas, 1 / tileMeters);
}

// repeatX/repeatY let the caller keep the squares square on a plane that isn't
export function makeCheckerTexture(squares = 8, repeatX = 1, repeatY = 1) {
  const size = 256, cell = size / squares;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#101012' : '#f4f4f4';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return toTexture(c, repeatX, repeatY);
}

export function makeCarPaintNormal() {
  const canvas = noiseCanvas({ size: 64, base: '#808080', variance: ['#828282', '#7e7e7e'], dots: 200, dotAlpha: 0.06 });
  return toTexture(normalMapFromCanvas(canvas, 0.6), 1, 1, false);
}

// ---------------------------------------------------------------- building facades

// One tile spans FACADE_TILE_X meters of frontage and FACADE_TILE_Y meters of height, split into
// an 8x8 grid of window bays. Building geometry scales its UVs by its own dimensions against those
// constants, so a 12m shop and a 120m tower end up with identically-sized windows.
export const FACADE_TILE_X = 26;   // 8 window bays at 3.25 m
export const FACADE_TILE_Y = 28;   // 8 storeys at 3.5 m
export const PLINTH_TILE_X = 20;   // 8 shopfront bays at 2.5 m; also keeps the 4:1 canvas unstretched

export const FACADE_SPECS = [
  { wall: '#3a4553', band: '#2f3844', glass: '#5f7d94', lit: '#ffd89a', litChance: 0.10, insetX: 5,  insetY: 9,  mullion: true },  // glass tower
  { wall: '#8d5240', band: '#7a4536', glass: '#232a31', lit: '#ffd08a', litChance: 0.08, insetX: 16, insetY: 12, mullion: false }, // brick mid-rise
  { wall: '#a49c90', band: '#8f887d', glass: '#2b3238', lit: '#ffdca8', litChance: 0.07, insetX: 8,  insetY: 16, mullion: false }, // concrete ribbon-window office
  { wall: '#d5d2c9', band: '#bdb9ae', glass: '#41505c', lit: '#ffe3b0', litChance: 0.06, insetX: 12, insetY: 12, mullion: true },  // white panel block
];

/**
 * Builds a facade's albedo alongside a matching emissive mask holding only the lit windows, so the
 * bloom pass picks out scattered windows against the late-afternoon light for free.
 */
export function makeFacadeTextures(spec, rng) {
  const S = 512, cells = 8, cell = S / cells;
  const albedo = document.createElement('canvas');
  const emissive = document.createElement('canvas');
  albedo.width = albedo.height = emissive.width = emissive.height = S;
  const a = albedo.getContext('2d'), e = emissive.getContext('2d');

  a.fillStyle = spec.wall; a.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);

  for (let fy = 0; fy < cells; fy++) {
    a.fillStyle = spec.band;
    a.fillRect(0, fy * cell, S, 3);                     // floor slab band
    for (let fx = 0; fx < cells; fx++) {
      const x = fx * cell + spec.insetX, y = fy * cell + spec.insetY;
      const w = cell - spec.insetX * 2, h = cell - spec.insetY * 2;
      a.fillStyle = spec.glass;
      a.fillRect(x, y, w, h);
      const g = a.createLinearGradient(x, y, x, y + h);  // sky reflection down the glass
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.02)');
      g.addColorStop(1, 'rgba(0,0,0,0.20)');
      a.fillStyle = g;
      a.fillRect(x, y, w, h);
      if (rng() < spec.litChance) {
        e.fillStyle = spec.lit;
        e.fillRect(x, y, w, h);
        a.fillStyle = 'rgba(255,226,172,0.35)';
        a.fillRect(x, y, w, h);
      }
      if (spec.mullion) {
        a.fillStyle = spec.wall;
        a.fillRect(x + w / 2 - 1, y, 2, h);
      }
    }
  }

  // soft vertical grime so flat facades don't read as printed paper
  for (let i = 0; i < 120; i++) {
    a.fillStyle = `rgba(20,18,16,${0.02 + rng() * 0.05})`;
    a.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 20 + rng() * 120);
  }

  return { map: toTexture(albedo, 1, 1), emissiveMap: toTexture(emissive, 1, 1) };
}

// Street-level shopfronts: one band, applied to the plinth box at the base of every building.
export function makeStorefrontTexture(rng) {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2f34'; ctx.fillRect(0, 0, W, H);
  const bays = 8, bay = W / bays;
  const awnings = ['#b5452f', '#2f6b8f', '#3d7a4a', '#8a6f2f', '#6c3f7a'];
  for (let i = 0; i < bays; i++) {
    const x = i * bay;
    ctx.fillStyle = '#12161b';                                   // glazing
    ctx.fillRect(x + 5, 26, bay - 10, H - 44);
    ctx.fillStyle = `rgba(${180 + rng() * 60},${190 + rng() * 50},${200 + rng() * 45},0.20)`;
    ctx.fillRect(x + 5, 26, bay - 10, (H - 44) * 0.45);
    ctx.fillStyle = awnings[Math.floor(rng() * awnings.length)]; // fascia / awning
    ctx.fillRect(x + 2, 8, bay - 4, 16);
    ctx.fillStyle = '#0b0e11';                                   // door
    ctx.fillRect(x + bay * 0.62, 40, bay * 0.24, H - 58);
  }
  ctx.fillStyle = '#4a4f56'; ctx.fillRect(0, H - 10, W, 10);     // kickplate
  return toTexture(c, 1, 1);
}
