// flight.js — the courier plane's flight model: throttle, lift, bank, pitch,
// stall and the forces that make throttle and turn discipline matter.
// All units are SI-ish: metres, metres per second, radians, kilograms of fuel.

export const PLANE = {
  maxSpeed: 95, // m/s at full throttle, level
  minFlyingSpeed: 34, // below this the wing stops flying
  cruiseSpeed: 62,
  climbRate: 9, // m/s at full power, best climb
  sinkRate: 7, // m/s gliding with the throttle closed
  turnRate: 0.55, // rad/s at full bank
  maxBank: 1.05, // rad, about 60 degrees
  fuelCapacity: 100,
  fuelBurn: 0.55, // units per second at full throttle
  fuelBurnIdle: 0.12,
};

export function createPlane() {
  return {
    x: 0, // east, metres
    z: 2400, // south of the runway; the runway sits near z = 0
    heading: 0, // radians, 0 = north, grows clockwise
    altitude: 260, // metres above the valley floor
    speed: 58,
    throttle: 0.62,
    bank: 0, // radians, positive = right wing down
    pitch: 0, // radians, positive = nose up
    verticalSpeed: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    stalled: false,
    landed: false,
  };
}

// steer: { bankTarget: -1..1, pitchTarget: -1..1, throttleDelta, brake }
// Returns nothing; mutates the plane in place.
export function updateFlight(plane, steer, dt) {
  if (plane.landed) return;

  // Throttle follows the lever, and fuel only burns while the engine runs.
  plane.throttle = clamp(plane.throttle + steer.throttleDelta * dt, 0, 1);
  const burning = plane.fuel > 0;
  const burn = (PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * plane.throttle) * dt;
  plane.fuel = Math.max(0, plane.fuel - burn);
  if (!burning) plane.throttle = 0;

  // Bank eases toward the pilot's target; a heavy bank is what turns the plane.
  // Positive bank is right wing down, and a right bank turns the nose right.
  const bankTarget = clamp(steer.bankTarget, -1, 1) * PLANE.maxBank;
  plane.bank += (bankTarget - plane.bank) * Math.min(1, dt * 3.2);
  plane.heading += Math.sin(plane.bank) * PLANE.turnRate * dt;
  plane.heading = wrapAngle(plane.heading);

  // Pitch eases the same way. Pulling up trades speed for height.
  const pitchTarget = clamp(steer.pitchTarget, -1, 1) * 0.32;
  plane.pitch += (pitchTarget - plane.pitch) * Math.min(1, dt * 2.6);

  // Speed chases the throttle's target, faster when the nose is down.
  const targetSpeed = burning
    ? PLANE.minFlyingSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minFlyingSpeed)
    : PLANE.minFlyingSpeed * 0.4;
  const climbCost = Math.max(0, Math.sin(plane.pitch)) * 26;
  const speedTarget = Math.max(12, targetSpeed - climbCost + (steer.brake ? -22 : 0));
  plane.speed += (speedTarget - plane.speed) * Math.min(1, dt * 0.55);

  // A slow wing stalls: the nose drops and the plane sinks no matter the pitch.
  plane.stalled = plane.speed < PLANE.minFlyingSpeed && plane.altitude > 8;
  const effectivePitch = plane.stalled ? -0.3 : plane.pitch;
  plane.verticalSpeed = Math.sin(effectivePitch) * PLANE.climbRate * (plane.speed / PLANE.cruiseSpeed)
    - (1 - plane.throttle) * PLANE.sinkRate * 0.35
    - (plane.stalled ? 14 : 0);
  plane.altitude += plane.verticalSpeed * dt;

  // Move across the map along the heading.
  plane.x += Math.sin(plane.heading) * plane.speed * dt;
  plane.z -= Math.cos(plane.heading) * plane.speed * dt;
}

export function applyCrashDamage(plane, amount) {
  plane.damage = Math.min(100, plane.damage + amount);
  return plane.damage >= 100;
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function headingDegrees(heading) {
  return ((heading * 180) / Math.PI + 360) % 360;
}

export function knots(speed) {
  return speed * 1.94384;
}

export function feet(altitude) {
  return altitude * 3.28084;
}
