// Self-contained 2D value noise + fBm. No external noise library — this is the standard
// cheap trig-hash technique used across countless shader/procedural-terrain demos.

function hash(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise2D(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smoothstep(x - ix), fz = smoothstep(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fz;
}

export function fbm2D(x, z, { octaves = 5, lacunarity = 2, gain = 0.5 } = {}) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm; // roughly [0,1]
}
