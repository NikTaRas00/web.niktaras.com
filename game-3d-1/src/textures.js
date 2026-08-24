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
    const shade = variance[Math.floor(Math.random() * variance.length)];
    ctx.fillStyle = shade;
    ctx.globalAlpha = dotAlpha * (0.4 + Math.random() * 0.6);
    const x = Math.random() * size, y = Math.random() * size, r = 0.6 + Math.random() * 2.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

// derive a normal map from a grayscale height reading of the canvas (cheap Sobel-ish pass)
function normalMapFromCanvas(canvas, strength = 1.4) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, size, size).data;
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
      const hL = heightAt(x - 1, y), hR = heightAt(x + 1, y);
      const hD = heightAt(x, y - 1), hU = heightAt(x, y + 1);
      const nx = (hL - hR) * strength, ny = (hD - hU) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      img.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function toTexture(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeAsphaltTexture() {
  const tileLen = 6; // meters per tile, independent of track length
  const canvas = noiseCanvas({ base: '#33353b', variance: ['#3d4047', '#2a2c31', '#45484f', '#505459'], dots: 3000, dotAlpha: 0.28 });
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tileLen, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGrassTexture(groundSize) {
  const canvas = noiseCanvas({ base: '#2f7d3c', variance: ['#3a9349', '#276a33', '#1f5a2b', '#458f4f'], dots: 2600 });
  return toTexture(canvas, groundSize / 11.5);
}

export function makeCarPaintNormal() {
  const canvas = noiseCanvas({ size: 64, base: '#808080', variance: ['#828282', '#7e7e7e'], dots: 200, dotAlpha: 0.06 });
  const normal = normalMapFromCanvas(canvas, 0.6);
  return toTexture(normal, 1);
}
