// Central tuning constants. Nothing here does work — it's the dial panel for every other module.

export const TRACK = {
  straight: 400,      // length of each straight, meters
  turnRadius: 130,     // radius of each end turn, meters
  roadWidth: 16,
  curbWidth: 1.4,
  samples: 480,        // centerline resolution
  curbBandLen: 7,       // meters per red/white curb stripe
  // elevation profile: sum of sine harmonics over lap fraction t in [0,1) — periodic, so the
  // track always meets itself at the same height at the start/finish line.
  elevationHarmonics: [
    { freq: 1, amp: 16, phase: 0.15 },
    { freq: 3, amp: 6, phase: 2.1 },
    { freq: 7, amp: 2, phase: 0.7 },
  ],
};
TRACK.totalLen = 2 * TRACK.straight + 2 * Math.PI * TRACK.turnRadius;

export const TERRAIN = {
  groundSize: 1800,
  meshSegments: 170,     // terrain grid resolution (per side)
  genStride: 4,           // centerline sample stride used only while baking the terrain mesh (perf)
  blendDist: 55,           // meters beyond the road edge over which terrain blends from road height to hills
  roadBedDepth: 0.12,       // terrain sits this far below the road surface at the track edge
  hillAmplitude: 26,
  hillScale: 0.0035,        // spatial frequency of the base noise octave
  hillOctaves: 5,
  hillLacunarity: 2.0,
  hillGain: 0.5,
};

export const CAR_PHYSICS = {
  maxSpeed: 48,
  maxReverse: -10,
  accel: 18,
  brake: 30,
  drag: 8,
  offTrackDrag: 34,
  maxTurnRate: 2.1,
};

export const TRAFFIC = {
  count: 14,
  lanes: [-4.4, -1.4, 1.4, 4.4],
  speedRange: [13, 24],
  safeGap: 26,       // meters — starts braking for the car ahead inside this gap
  minGap: 9,          // meters — near-stop distance
  collisionDist: 2.5,  // player <-> traffic body-to-body distance that counts as a bump
};

export const VISUAL = {
  fogNear: 160,
  fogFar: 950,
  cameraFar: 1600,
  sunOffset: { x: -80, y: 120, z: 60 },
  shadowFrustum: 110,
};
