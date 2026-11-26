// missions.js — what the courier has to do: fly a sequence of rings, then put
// the plane down on the runway. Rings, landings and the score all live here.

import { RUNWAY, groundHeightAt } from './terrain.js';
import { clamp, headingDegrees, wrapAngle } from './flight.js';

export const RING_RADIUS = 46;

export const MISSIONS = [
  {
    id: 1,
    name: 'Ring Run',
    brief: 'Fly through all 5 rings over the valley, in order. Mind your fuel.',
    rings: [
      { x: -420, z: 1500, altitude: 240 },
      { x: -900, z: 500, altitude: 200 },
      { x: -500, z: -600, altitude: 280 },
      { x: 500, z: -1100, altitude: 220 },
      { x: 900, z: -200, altitude: 260 },
    ],
    landing: false,
  },
  {
    id: 2,
    name: 'Courier Landing',
    brief: 'Thread 3 rings, then land on runway 36. Slow, level, on the centreline.',
    rings: [
      { x: 700, z: 1900, altitude: 220 },
      { x: 350, z: 900, altitude: 160 },
      { x: 60, z: 420, altitude: 110 },
    ],
    landing: true,
  },
];

export function createMissionState(mission) {
  return {
    mission,
    ringIndex: 0,
    ringsPassed: 0,
    score: 0,
    ringFlash: 0, // seconds left showing the "ring passed" flash
    message: '',
    messageTime: 0,
    landed: false,
    landingQuality: 0,
    finished: false,
    outcome: '', // 'rings' | 'landed' | 'crashed' | 'fuel'
  };
}

export function nextRing(state) {
  return state.mission.rings[state.ringIndex] ?? null;
}

// True when the plane's nose is inside the ring's circle.
export function ringPassed(ring, plane) {
  const dx = plane.x - ring.x;
  const dz = plane.z - ring.z;
  const dh = plane.altitude - ring.altitude;
  return Math.hypot(dx, dz, dh) < RING_RADIUS;
}

export function updateMission(state, plane, dt) {
  if (state.finished) return;
  state.ringFlash = Math.max(0, state.ringFlash - dt);
  state.messageTime = Math.max(0, state.messageTime - dt);

  const ring = nextRing(state);
  if (ring && ringPassed(ring, plane)) {
    state.ringIndex++;
    state.ringsPassed++;
    state.ringFlash = 1.2;
    const speedBonus = Math.round(clamp(plane.speed, 0, 90));
    const fuelBonus = Math.round(plane.fuel * 0.4);
    state.score += 100 + speedBonus + fuelBonus;
    state.message = `RING ${state.ringsPassed} / ${state.mission.rings.length}  +${100 + speedBonus + fuelBonus}`;
    state.messageTime = 2.2;
    if (state.ringIndex >= state.mission.rings.length && !state.mission.landing) {
      state.finished = true;
      state.outcome = 'rings';
      state.score += Math.round(plane.fuel) * 5 + 250;
    }
    return 'ring';
  }

  if (state.mission.landing && state.ringIndex >= state.mission.rings.length) {
    state.message = 'ALL RINGS CLEAR — LAND ON RUNWAY 36';
    state.messageTime = Math.max(state.messageTime, 0.4);
  }
  return null;
}

// Called when the wheels (or belly) meet the ground. Returns a landing report.
export function judgeTouchdown(state, plane) {
  const runway = RUNWAY;
  const along = (plane.z - runway.z) * -Math.cos(runway.heading)
    + (plane.x - runway.x) * Math.sin(runway.heading);
  const across = (plane.x - runway.x) * Math.cos(runway.heading)
    - (plane.z - runway.z) * Math.sin(runway.heading);
  const onRunway = Math.abs(along) < runway.length / 2 && Math.abs(across) < runway.width / 2;
  const headingError = Math.abs(wrapAngle(plane.heading - runway.heading));
  const aligned = headingError < 0.35 || headingError > Math.PI - 0.35;
  const gentle = Math.abs(plane.verticalSpeed) < 4.5;
  const slow = plane.speed < 62;

  if (!state.mission.landing || state.ringIndex < state.mission.rings.length) {
    return { survived: false, reason: onRunway ? 'touched down off-mission' : 'terrain strike' };
  }
  if (!onRunway) return { survived: false, reason: 'landed short of the runway' };
  if (!gentle) return { survived: false, reason: 'landing too hard' };
  if (!slow) return { survived: false, reason: 'too fast to land' };
  if (!aligned) return { survived: false, reason: 'not lined up with the runway' };

  const quality = Math.round(
    100
    - Math.abs(across) * 1.6
    - Math.abs(plane.verticalSpeed) * 6
    - Math.max(0, plane.speed - 45) * 1.2
    - headingDegrees(headingError) * 0.4,
  );
  state.landingQuality = clamp(quality, 20, 100);
  state.score += 300 + state.landingQuality * 4 + Math.round(plane.fuel) * 5;
  state.finished = true;
  state.outcome = 'landed';
  return { survived: true, quality: state.landingQuality };
}

// True when the plane is low over the valley floor or the ridge.
export function terrainStrike(plane) {
  return plane.altitude <= groundHeightAt(plane.x, plane.z) + 2;
}

export function bearingTo(plane, target) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const bearing = Math.atan2(dx, -dz);
  return wrapAngle(bearing - plane.heading);
}

export function distanceTo(plane, target) {
  return Math.hypot(target.x - plane.x, target.z - plane.z, target.altitude - plane.altitude);
}
