// terrain.js — the valley the courier flies over, built from one seed so every
// run shows the same mountains, river, fields and runway. Nothing here is an
// image: every feature is placed by numbers and drawn by render.js.

export const RUNWAY = {
  x: 0,
  z: 0,
  heading: 0, // the runway points north-south
  length: 900,
  width: 52,
};

// The airfield around the runway: approach lights marching out to the south,
// a parallel taxiway, an apron and two hangars, so the field reads on approach.
export function buildAirfield() {
  const lights = [];
  for (let d = 520; d <= 880; d += 72) lights.push({ x: 0, z: d });
  return {
    approachLights: lights,
    taxiway: { x: 78, z: 0, length: 900, width: 16 },
    apron: { x: -110, z: 120, half: 90 },
    hangars: [
      { x: -170, z: 60, w: 70, d: 46 },
      { x: -170, z: 170, w: 70, d: 46 },
    ],
  };
}

export const WORLD = {
  halfSize: 3200, // the flyable valley, metres each way from the centre
  mountainRing: 5200, // distant peaks sit beyond the flyable edge
  viewDistance: 4200,
};

// A tiny deterministic generator so the valley never changes between sessions.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rolling hills inside the valley, steep ridges toward the edges, so a pilot
// who wanders off the valley floor meets rising ground.
export function groundHeightAt(x, z) {
  // The airfield is graded flat so the runway, taxiway and apron sit level.
  if (Math.abs(x) < 550 && Math.abs(z) < 850) return 0;
  const hill = 14 * Math.sin(x * 0.0011 + 1.7) * Math.cos(z * 0.0009 - 0.6)
    + 9 * Math.sin(x * 0.0023 - z * 0.0015);
  const edge = Math.max(Math.abs(x), Math.abs(z)) - WORLD.halfSize;
  const ridge = edge > 0 ? Math.min(420, edge * 0.16) : 0;
  return Math.max(0, hill + ridge);
}

function buildFields(random) {
  const palette = ['#7fae56', '#8fb45a', '#6d9e4e', '#a8b45c', '#c2a95e', '#5f8f4a', '#93a94f'];
  const fields = [];
  const cell = 260;
  for (let gx = -12; gx <= 12; gx++) {
    for (let gz = -12; gz <= 12; gz++) {
      if (random() < 0.18) continue; // meadow gaps between the fields
      const cx = gx * cell + (random() - 0.5) * 60;
      const cz = gz * cell + (random() - 0.5) * 60;
      if (Math.hypot(cx - RUNWAY.x, cz - RUNWAY.z) < 620) continue; // keep the airfield clear
      fields.push({
        x: cx, z: cz,
        half: cell * (0.42 + random() * 0.08),
        color: palette[Math.floor(random() * palette.length)],
        tone: random(),
      });
    }
  }
  return fields;
}

function buildRiver(random) {
  // The river winds north to south through the valley, west of the runway.
  const points = [];
  for (let z = -WORLD.halfSize; z <= WORLD.halfSize; z += 160) {
    points.push({ x: -780 + 260 * Math.sin(z * 0.00042) + 90 * Math.sin(z * 0.0013 + 2), z });
  }
  return { points, width: 34, color: '#3f7fb5' };
}

function buildMountains(random) {
  const peaks = [];
  for (let i = 0; i < 46; i++) {
    const angle = (i / 46) * Math.PI * 2 + (random() - 0.5) * 0.1;
    const distance = WORLD.mountainRing + random() * 1400;
    peaks.push({
      x: Math.sin(angle) * distance,
      z: Math.cos(angle) * distance,
      height: 700 + random() * 900,
      width: 500 + random() * 700,
      snow: random() > 0.45,
    });
  }
  return peaks;
}

function buildClouds(random) {
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (random() - 0.5) * 9000,
      z: (random() - 0.5) * 9000,
      altitude: 620 + random() * 420,
      scale: 120 + random() * 220,
      puffs: 3 + Math.floor(random() * 3),
    });
  }
  return clouds;
}

function buildTreeLines(random) {
  const trees = [];
  for (let i = 0; i < 420; i++) {
    const x = (random() - 0.5) * WORLD.halfSize * 2;
    const z = (random() - 0.5) * WORLD.halfSize * 2;
    if (Math.hypot(x - RUNWAY.x, z - RUNWAY.z) < 620) continue;
    if (Math.abs(x + 780) < 120 && Math.abs(z) < WORLD.halfSize) continue; // not in the river
    trees.push({ x, z, size: 5 + random() * 7 });
  }
  return trees;
}

export function buildTerrain(seed = 20261126) {
  const random = mulberry32(seed);
  return {
    fields: buildFields(random),
    river: buildRiver(random),
    mountains: buildMountains(random),
    clouds: buildClouds(random),
    trees: buildTreeLines(random),
    runway: RUNWAY,
    airfield: buildAirfield(),
  };
}

// Distance from a point to the river's centre line, for a soft crash margin.
export function distanceToRiver(terrain, x, z) {
  let best = Infinity;
  const pts = terrain.river.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x, bz = pts[i + 1].z;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const px = ax + dx * t, pz = az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}
