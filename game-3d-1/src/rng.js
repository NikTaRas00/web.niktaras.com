// Seeded PRNG (mulberry32). The city is generated once at load from a fixed seed so the circuit
// you learn on one run is the same circuit on the next — a track you can't memorize isn't a track.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng, lo, hi) => lo + rng() * (hi - lo);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
