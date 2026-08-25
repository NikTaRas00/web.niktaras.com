// Central tuning constants. Nothing here does work — it's the dial panel for every other module.

// The circuit is a closed street course: a polygon of city blocks with filleted (arc) corners,
// exactly how a real temporary street circuit is laid out over an existing grid. Each waypoint is
// a junction; `r` is the corner radius the racing surface is rounded to.
export const TRACK = {
  roadWidth: 18,          // four lanes of city street
  kerbWidth: 0.9,
  sidewalkWidth: 5.5,
  sidewalkHeight: 0.17,
  barrierWidth: 0.45,
  barrierHeight: 1.05,
  kerbBandLen: 2.5,        // meters per red/white kerb stripe
  sampleSpacing: 2.5,       // centerline resolution, meters between samples
  startOffset: 150,          // start/finish line, meters along the main straight past turn exit
  waypoints: [
    { x: -380, z: -320, r: 40 }, // exit onto the main straight
    { x:  360, z: -320, r: 48 }, // T1 — heavy braking at the end of the long straight
    { x:  360, z:  -80, r: 38 }, // T2
    { x:  500, z:  -80, r: 44 }, // T3
    { x:  500, z:  200, r: 50 }, // T4 — fast sweeper along the waterfront side
    { x:  220, z:  200, r: 34 }, // T5
    { x:  220, z:  350, r: 40 }, // T6
    { x:  -70, z:  350, r: 32 }, // T7
    { x:  -70, z:  170, r: 24 }, // T8 — hairpin in
    { x: -160, z:  170, r: 24 }, // T9 — hairpin out
    { x: -160, z:  350, r: 36 }, // T10
    { x: -500, z:  350, r: 48 }, // T11
    { x: -500, z:  -80, r: 44 }, // T12
    { x: -380, z:  -80, r: 40 }, // T13 — quick chicane back onto the straight
  ],
  // Elevation profile: sum of sine harmonics over lap fraction t in [0,1) — periodic, so the
  // circuit always meets itself at the same height at the start/finish line. Kept gentle: a city
  // built on rolling ground, not a mountain pass, so the blocks either side stay believable.
  elevationHarmonics: [
    { freq: 1, amp: 3.6, phase: 0.6 },
    { freq: 2, amp: 1.6, phase: 2.4 },
    { freq: 5, amp: 0.6, phase: 1.1 },
  ],
};
// half-width of the drivable corridor: road + kerb + sidewalk, up to the barrier line
TRACK.corridorHalf = TRACK.roadWidth / 2 + TRACK.kerbWidth + TRACK.sidewalkWidth;

export const GROUND = {
  size: 2600,
  segments: 240,
  baseY: 0,            // the city sits on a flat datum away from the circuit
  bedDepth: 0.35,       // ground sits this far below the road surface at the kerb line
  flatRadius: 20,        // ground holds road height out to here (covers the whole corridor)
  blendDist: 50,          // ...then ramps to the flat datum over this distance
};

export const CITY = {
  setback: 18.5,        // building frontage distance from the centerline
  minClear: 16.8,        // no part of any building may come closer than this to the centerline
  minWidth: 10,
  maxWidth: 34,
  depthTries: [32, 25, 19, 14],
  gapChance: 0.16,        // chance of a side-street gap between frontage buildings
  gapRange: [14, 30],
  blockPitch: 128,         // background city block grid
  blockKeepOut: 88,         // background blocks stay this far from the centerline
  blockPad: [104, 86],
  extent: 2100,
  lampSpacing: 40,
  seed: 20260825,
};

export const CAR_PHYSICS = {
  maxSpeed: 48,
  maxReverse: -10,
  accel: 19,
  brake: 32,
  drag: 8,
  sidewalkDrag: 30,      // running wide onto the pavement scrubs speed hard
  wallScrub: 0.72,        // speed retained after scraping a barrier
  maxTurnRate: 2.1,
  turnFalloff: 0.45,       // grip falls off with speed, so corners need braking
};

export const TRAFFIC = {
  count: 18,
  lanes: [-6.75, -2.25, 2.25, 6.75],
  speedRange: [13, 24],
  safeGap: 26,       // meters — starts braking for the car ahead inside this gap
  minGap: 9,          // meters — near-stop distance
  collisionDist: 3.0,  // player <-> traffic body-to-body distance that counts as a bump
};

export const VISUAL = {
  fogNear: 260,
  fogFar: 1500,
  cameraFar: 4000,
  shadowFrustum: 200,
};
