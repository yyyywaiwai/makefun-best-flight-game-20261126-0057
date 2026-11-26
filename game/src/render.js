// render.js — everything the pilot sees: sky, sun, mountains, the ground plane
// with its fields and river, the runway, the rings and the courier plane itself.
// The chase camera sits behind the plane and looks along its heading.

import { groundHeightAt, WORLD } from './terrain.js';
import { RING_RADIUS } from './missions.js';
import { clamp } from './flight.js';

export function makeView(width, height, plane) {
  const focal = height * 1.15;
  const horizonY = height * 0.40 + plane.pitch * focal * 0.55;
  return {
    width, height, focal, horizonY,
    cx: width / 2,
    sinH: Math.sin(plane.heading),
    cosH: Math.cos(plane.heading),
    plane,
  };
}

// Project a world point (x, altitude, z) to screen space. Returns null behind us.
export function projectPoint(view, x, altitude, z) {
  const relX = x - view.plane.x;
  const relZ = z - view.plane.z;
  const forward = relX * view.sinH - relZ * view.cosH;
  if (forward < 6) return null;
  const lateral = relX * view.cosH + relZ * view.sinH;
  return {
    x: view.cx + (lateral * view.focal) / forward,
    y: view.horizonY + ((view.plane.altitude - altitude) * view.focal) / forward,
    forward,
    scale: view.focal / forward,
  };
}

function screenBearing(view, bearing) {
  return view.cx + Math.tan(bearing) * view.focal;
}

function drawSky(ctx, view, time) {
  const { width, height, horizonY } = view;
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  sky.addColorStop(0, '#2f6db3');
  sky.addColorStop(0.55, '#7fb2dd');
  sky.addColorStop(1, '#cfe6f2');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizonY + 40);

  // The sun hangs low in the west, fixed in the world.
  const sunBearing = Math.atan2(-1, 0) - view.plane.heading; // west
  const sunX = screenBearing(view, wrapBearing(sunBearing));
  const sunY = horizonY - height * 0.16;
  if (sunX > -120 && sunX < width + 120) {
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
    glow.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 220, 130, 0.55)');
    glow.addColorStop(1, 'rgba(255, 220, 130, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Thin high cloud bands drifting slowly across the sky.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 5; i++) {
    const bandY = height * (0.06 + i * 0.055);
    const offset = ((time * 6 + i * 260) % (width + 420)) - 210;
    ctx.beginPath();
    ctx.ellipse(offset, bandY, 150 + i * 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  void time;
}

function wrapBearing(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function drawMountains(ctx, view, mountains) {
  const { horizonY, width } = view;
  // Far peaks first so nearer ones overlap them.
  const sorted = [...mountains].sort((a, b) => b.x * b.x + b.z * b.z - (a.x * a.x + a.z * a.z));
  for (const peak of sorted) {
    const bearing = wrapBearing(Math.atan2(peak.x - view.plane.x, -(peak.z - view.plane.z)) - view.plane.heading);
    if (Math.abs(bearing) > 1.15) continue;
    const distance = Math.hypot(peak.x - view.plane.x, peak.z - view.plane.z);
    const peakX = screenBearing(view, bearing);
    const peakHeight = (peak.height * view.focal) / distance;
    const halfWidth = (peak.width * view.focal) / distance;
    if (peakX + halfWidth < -40 || peakX - halfWidth > width + 40) continue;
    const baseY = horizonY + 6;
    ctx.fillStyle = '#5d6f8a';
    ctx.beginPath();
    ctx.moveTo(peakX - halfWidth, baseY);
    ctx.lineTo(peakX, baseY - peakHeight);
    ctx.lineTo(peakX + halfWidth, baseY);
    ctx.closePath();
    ctx.fill();
    if (peak.snow && peakHeight > 26) {
      ctx.fillStyle = '#eef4fa';
      ctx.beginPath();
      ctx.moveTo(peakX - halfWidth * 0.34, baseY - peakHeight * 0.66);
      ctx.lineTo(peakX, baseY - peakHeight);
      ctx.lineTo(peakX + halfWidth * 0.34, baseY - peakHeight * 0.66);
      ctx.lineTo(peakX + halfWidth * 0.16, baseY - peakHeight * 0.58);
      ctx.lineTo(peakX, baseY - peakHeight * 0.66);
      ctx.lineTo(peakX - halfWidth * 0.16, baseY - peakHeight * 0.58);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawGroundBase(ctx, view) {
  const { width, height, horizonY } = view;
  const ground = ctx.createLinearGradient(0, horizonY, 0, height);
  ground.addColorStop(0, '#8a9a6a');
  ground.addColorStop(0.35, '#6f8f52');
  ground.addColorStop(1, '#55763f');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizonY, width, height - horizonY);
}

function projectQuad(ctx, view, corners) {
  const pts = corners.map(([x, alt, z]) => projectPoint(view, x, alt, z));
  if (pts.some((p) => p === null)) return null;
  return pts;
}

function drawFields(ctx, view, fields) {
  const { plane } = view;
  for (const field of fields) {
    const dx = field.x - plane.x;
    const dz = field.z - plane.z;
    if (Math.hypot(dx, dz) > WORLD.viewDistance) continue;
    const h = groundHeightAt(field.x, field.z);
    const quad = projectQuad(ctx, view, [
      [field.x - field.half, h, field.z - field.half],
      [field.x + field.half, h, field.z - field.half],
      [field.x + field.half, h, field.z + field.half],
      [field.x - field.half, h, field.z + field.half],
    ]);
    if (!quad) continue;
    ctx.fillStyle = field.color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawRiver(ctx, view, river) {
  const { plane } = view;
  ctx.fillStyle = river.color;
  for (let i = 0; i < river.points.length - 1; i++) {
    const a = river.points[i];
    const b = river.points[i + 1];
    if (Math.hypot(a.x - plane.x, a.z - plane.z) > WORLD.viewDistance + 200) continue;
    const ha = groundHeightAt(a.x, a.z);
    const hb = groundHeightAt(b.x, b.z);
    const w = river.width / 2;
    const quad = projectQuad(ctx, view, [
      [a.x - w, ha + 1, a.z], [a.x + w, ha + 1, a.z],
      [b.x + w, hb + 1, b.z], [b.x - w, hb + 1, b.z],
    ]);
    if (!quad) continue;
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let j = 1; j < 4; j++) ctx.lineTo(quad[j].x, quad[j].y);
    ctx.closePath();
    ctx.fill();
  }
  // A pale glint along the water so the river reads at a glance.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  for (const p of river.points) {
    const q = projectPoint(view, p.x, groundHeightAt(p.x, p.z) + 2, p.z);
    if (!q) { started = false; continue; }
    if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}

function drawTrees(ctx, view, trees) {
  const { plane } = view;
  ctx.fillStyle = '#2f5d33';
  for (const tree of trees) {
    const dx = tree.x - plane.x;
    const dz = tree.z - plane.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1500 || dist < 30) continue;
    const p = projectPoint(view, tree.x, groundHeightAt(tree.x, tree.z) + 4, tree.z);
    if (!p) continue;
    const r = Math.max(1, (tree.size * view.focal) / p.forward / 6);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawClouds(ctx, view, clouds) {
  for (const cloud of clouds) {
    const p = projectPoint(view, cloud.x, cloud.altitude, cloud.z);
    if (!p || p.forward > 6000) continue;
    const s = cloud.scale * p.scale * 0.9;
    if (s < 4) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    for (let i = 0; i < cloud.puffs; i++) {
      const px = p.x + (i - cloud.puffs / 2) * s * 0.55;
      const py = p.y + Math.sin(i * 2.1) * s * 0.08;
      ctx.beginPath();
      ctx.ellipse(px, py, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRunway(ctx, view, runway) {
  const halfLen = runway.length / 2;
  const halfW = runway.width / 2;
  const h = groundHeightAt(runway.x, runway.z);
  // Drawn in 150 m segments so the part behind the camera never hides the
  // part ahead of it (a quad with one corner behind us cannot be drawn whole).
  for (let d = -halfLen; d < halfLen; d += 150) {
    const d2 = Math.min(halfLen, d + 150);
    const quad = projectQuad(ctx, view, [
      [runway.x - halfW, h + 1, runway.z + d],
      [runway.x + halfW, h + 1, runway.z + d],
      [runway.x + halfW, h + 1, runway.z + d2],
      [runway.x - halfW, h + 1, runway.z + d2],
    ]);
    if (!quad) continue;
    ctx.fillStyle = '#3a3f46';
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // Centreline dashes and the threshold bars.
  ctx.fillStyle = '#f5f5f0';
  for (let d = -halfLen + 60; d < halfLen - 40; d += 90) {
    const dash = projectQuad(ctx, view, [
      [runway.x - 2.5, h + 2, runway.z + d],
      [runway.x + 2.5, h + 2, runway.z + d],
      [runway.x + 2.5, h + 2, runway.z + d + 42],
      [runway.x - 2.5, h + 2, runway.z + d + 42],
    ]);
    if (!dash) continue;
    ctx.beginPath();
    ctx.moveTo(dash[0].x, dash[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(dash[i].x, dash[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // The "36" painted at the near threshold, big enough to read on approach.
  const label = projectPoint(view, runway.x, h + 2, runway.z + halfLen - 90);
  if (label && label.forward < 2600) {
    ctx.fillStyle = '#f5f5f0';
    ctx.font = `bold ${Math.max(10, 900 / label.forward * 10)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('36', label.x, label.y);
  }
  // A windsock and a small beacon hut beside the strip.
  const sock = projectPoint(view, runway.x + 70, h + 22, runway.z + 120);
  if (sock) {
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sock.x, sock.y + 18 * sock.scale * 0.4);
    ctx.lineTo(sock.x, sock.y);
    ctx.stroke();
    ctx.fillStyle = '#e2543e';
    ctx.beginPath();
    ctx.moveTo(sock.x, sock.y);
    ctx.lineTo(sock.x + 16 * sock.scale * 0.4, sock.y + 3);
    ctx.lineTo(sock.x, sock.y + 6);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRings(ctx, view, missionState) {
  const rings = missionState.mission.rings;
  for (let i = missionState.ringIndex; i < rings.length; i++) {
    const ring = rings[i];
    const isNext = i === missionState.ringIndex;
    const p = projectPoint(view, ring.x, ring.altitude, ring.z);
    if (!p) continue;
    const radius = (RING_RADIUS * view.focal) / p.forward;
    if (radius < 3 || radius > 900) continue;
    // A faint post from the ring down to the ground, so its height reads.
    const base = projectPoint(view, ring.x, groundHeightAt(ring.x, ring.z), ring.z);
    if (base) {
      ctx.strokeStyle = isNext ? 'rgba(255,176,32,0.5)' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(base.x, base.y);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.92);
    ctx.lineWidth = Math.max(2, radius * 0.09);
    ctx.strokeStyle = isNext ? '#ffb020' : 'rgba(255,255,255,0.75)';
    ctx.shadowColor = isNext ? '#ffb020' : 'transparent';
    ctx.shadowBlur = isNext ? 18 : 0;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (isNext) {
      ctx.fillStyle = '#ffb020';
      ctx.font = `bold ${Math.max(12, Math.min(22, radius * 0.3))}px sans-serif`;
      ctx.textAlign = 'center';
      const dist = Math.round(Math.hypot(ring.x - view.plane.x, ring.z - view.plane.z));
      ctx.fillText(`RING ${i + 1} · ${dist}m`, p.x, p.y - radius - 12);
    }
  }
}

// The courier plane, drawn from behind and slightly above, banking with turns.
export function drawPlane(ctx, view, plane, time) {
  const x = view.cx;
  const y = view.horizonY + view.height * 0.24;
  const size = clamp(view.height / 520, 0.55, 1.5);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(plane.bank * 0.9);
  ctx.scale(size, size);
  // Propeller blur.
  ctx.fillStyle = 'rgba(200,210,220,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -118, 10, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wings.
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.moveTo(-118, -18);
  ctx.quadraticCurveTo(-118, -42, -96, -44);
  ctx.lineTo(-14, -30);
  ctx.lineTo(14, -30);
  ctx.lineTo(96, -44);
  ctx.quadraticCurveTo(118, -42, 118, -18);
  ctx.lineTo(14, 2);
  ctx.lineTo(-14, 2);
  ctx.closePath();
  ctx.fill();
  // Tailplane.
  ctx.fillStyle = '#a83622';
  ctx.beginPath();
  ctx.moveTo(-52, 62);
  ctx.lineTo(-46, 46);
  ctx.lineTo(46, 46);
  ctx.lineTo(52, 62);
  ctx.lineTo(10, 72);
  ctx.lineTo(-10, 72);
  ctx.closePath();
  ctx.fill();
  // Fuselage.
  const body = ctx.createLinearGradient(-14, 0, 14, 0);
  body.addColorStop(0, '#f3e2c2');
  body.addColorStop(0.5, '#fdf6e3');
  body.addColorStop(1, '#e8d3ae');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -128);
  ctx.quadraticCurveTo(13, -96, 15, -40);
  ctx.quadraticCurveTo(16, 20, 12, 66);
  ctx.quadraticCurveTo(8, 84, 0, 86);
  ctx.quadraticCurveTo(-8, 84, -12, 66);
  ctx.quadraticCurveTo(-16, 20, -15, -40);
  ctx.quadraticCurveTo(-13, -96, 0, -128);
  ctx.closePath();
  ctx.fill();
  // Canopy and stripe.
  ctx.fillStyle = '#274b6d';
  ctx.beginPath();
  ctx.ellipse(0, -72, 9, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8442c';
  ctx.fillRect(-15, -28, 30, 7);
  // Spinning prop hub.
  ctx.fillStyle = '#33302c';
  ctx.beginPath();
  ctx.arc(0, -122, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Stall buffet: the whole frame shudders a little when the wing quits.
  if (plane.stalled) {
    ctx.fillStyle = 'rgba(255,60,40,0.06)';
    ctx.fillRect(0, 0, view.width, view.height);
  }
  void time;
}

export function drawScene(ctx, view, terrain, missionState, time) {
  drawSky(ctx, view, time);
  drawMountains(ctx, view, terrain.mountains);
  drawGroundBase(ctx, view);
  drawFields(ctx, view, terrain.fields);
  drawRiver(ctx, view, terrain.river);
  drawTrees(ctx, view, terrain.trees);
  drawRunway(ctx, view, terrain.runway);
  drawAirfield(ctx, view, terrain.airfield);
  drawRings(ctx, view, missionState);
  drawClouds(ctx, view, terrain.clouds);
  drawPlane(ctx, view, view.plane, time);
}

// Taxiway, apron, hangars and the approach-light row that leads the pilot in.
function drawAirfield(ctx, view, airfield) {
  if (!airfield) return;
  const h = groundHeightAt(0, 0);
  const tw = airfield.taxiway;
  for (let d = -tw.length / 2; d < tw.length / 2; d += 150) {
    const d2 = Math.min(tw.length / 2, d + 150);
    const taxi = projectQuad(ctx, view, [
      [tw.x - tw.width / 2, h + 1, tw.z + d],
      [tw.x + tw.width / 2, h + 1, tw.z + d],
      [tw.x + tw.width / 2, h + 1, tw.z + d2],
      [tw.x - tw.width / 2, h + 1, tw.z + d2],
    ]);
    if (!taxi) continue;
    ctx.fillStyle = '#4a4f55';
    ctx.beginPath();
    ctx.moveTo(taxi[0].x, taxi[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(taxi[i].x, taxi[i].y);
    ctx.closePath();
    ctx.fill();
  }
  const ap = airfield.apron;
  const apron = projectQuad(ctx, view, [
    [ap.x - ap.half, h + 1, ap.z - ap.half],
    [ap.x + ap.half, h + 1, ap.z - ap.half],
    [ap.x + ap.half, h + 1, ap.z + ap.half],
    [ap.x - ap.half, h + 1, ap.z + ap.half],
  ]);
  if (apron) {
    ctx.fillStyle = '#565b61';
    ctx.beginPath();
    ctx.moveTo(apron[0].x, apron[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(apron[i].x, apron[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // Hangars read as pale boxes with a dark roof line.
  for (const hangar of airfield.hangars) {
    const base = projectQuad(ctx, view, [
      [hangar.x - hangar.w / 2, h + 1, hangar.z - hangar.d / 2],
      [hangar.x + hangar.w / 2, h + 1, hangar.z - hangar.d / 2],
      [hangar.x + hangar.w / 2, h + 1, hangar.z + hangar.d / 2],
      [hangar.x - hangar.w / 2, h + 1, hangar.z + hangar.d / 2],
    ]);
    if (!base) continue;
    ctx.fillStyle = '#c8cdd2';
    ctx.beginPath();
    ctx.moveTo(base[0].x, base[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(base[i].x, base[i].y);
    ctx.closePath();
    ctx.fill();
    const roof = projectPoint(view, hangar.x, h + 18, hangar.z);
    if (roof) {
      ctx.fillStyle = '#8a6f5c';
      ctx.beginPath();
      ctx.ellipse(roof.x, roof.y, Math.max(3, 34 * roof.scale), Math.max(2, 12 * roof.scale), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Approach lights: a row of bright bars guiding the pilot to the threshold.
  for (const light of airfield.approachLights) {
    const p = projectPoint(view, light.x, h + 3, light.z);
    if (!p || p.forward > 3200) continue;
    const r = Math.max(1.5, 260 / p.forward);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
