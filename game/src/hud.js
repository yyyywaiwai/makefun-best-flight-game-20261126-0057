// hud.js — the instruments: altitude, speed and heading on the tape, throttle,
// fuel and damage gauges, the artificial horizon, and the mission readout.
// Everything is drawn on the same canvas, in one flat instrument style.

import { feet, headingDegrees, knots } from './flight.js';
import { bearingTo, distanceTo, nextRing } from './missions.js';
import { clamp } from './flight.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 20, 34, 0.62)';
  ctx.strokeStyle = 'rgba(160, 200, 235, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size = 11, color = '#9fc3e8') {
  ctx.fillStyle = color;
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function bigValue(ctx, text, x, y, size = 26, color = '#ffffff') {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function gaugeBar(ctx, x, y, w, h, fraction, fillColor, labelText) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w * clamp(fraction, 0, 1)), h, 4);
  ctx.fill();
  label(ctx, labelText, x, y - 5);
}

export function drawArtificialHorizon(ctx, x, y, radius, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.bank);
  const pitchOffset = plane.pitch * radius * 1.6;
  ctx.fillStyle = '#3f7fc0';
  ctx.fillRect(-radius, -radius + pitchOffset, radius * 2, radius);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-radius, pitchOffset, radius * 2, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-radius, pitchOffset);
  ctx.lineTo(radius, pitchOffset);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(220,235,250,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings marker.
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.lineTo(x, y + 5);
  ctx.closePath();
  ctx.fill();
}

export function drawHud(ctx, width, height, plane, missionState, terrain, time) {
  // --- Left instruments: altitude, speed, heading ---
  panel(ctx, 14, 14, 218, 108);
  label(ctx, 'ALTITUDE', 26, 34);
  bigValue(ctx, `${Math.round(feet(plane.altitude)).toLocaleString()} ft`, 26, 62);
  label(ctx, 'SPEED', 26, 84);
  bigValue(ctx, `${Math.round(knots(plane.speed))} kt`, 26, 108, 22);
  label(ctx, 'HDG', 150, 84);
  bigValue(ctx, `${String(Math.round(headingDegrees(plane.heading))).padStart(3, '0')}°`, 150, 108, 22);

  // Heading tape across the top centre.
  const tapeW = 320;
  const tapeX = width / 2 - tapeW / 2;
  panel(ctx, tapeX, 14, tapeW, 40);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(tapeX, 14, tapeW, 40, 8);
  ctx.clip();
  const heading = headingDegrees(plane.heading);
  for (let d = Math.floor((heading - 60) / 15) * 15; d <= heading + 60; d += 15) {
    const deg = ((d % 360) + 360) % 360;
    const offset = (d - heading) * (tapeW / 120);
    const x = width / 2 + offset;
    if (x < tapeX + 18 || x > tapeX + tapeW - 18) continue; // never half-draw a label
    ctx.fillStyle = deg % 90 === 0 ? '#ffffff' : '#9fc3e8';
    ctx.font = deg % 90 === 0 ? 'bold 13px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(deg % 90 === 0 ? ['N', 'E', 'S', 'W'][deg / 90] : String(deg), x, 42);
    ctx.fillRect(x - 0.5, 18, 1, deg % 90 === 0 ? 10 : 6);
  }
  ctx.restore();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(width / 2 - 6, 14);
  ctx.lineTo(width / 2 + 6, 14);
  ctx.lineTo(width / 2, 24);
  ctx.closePath();
  ctx.fill();

  // --- Right instruments: fuel, damage, score ---
  panel(ctx, width - 232, 14, 218, 108);
  gaugeBar(ctx, width - 218, 44, 190, 12, plane.fuel / 100,
    plane.fuel < 25 ? '#e2543e' : '#5ec46a', `FUEL  ${Math.round(plane.fuel)}%`);
  gaugeBar(ctx, width - 218, 76, 190, 12, 1 - plane.damage / 100,
    plane.damage > 60 ? '#e2543e' : '#e8b23e', `AIRFRAME  ${Math.round(100 - plane.damage)}%`);
  label(ctx, 'SCORE', width - 218, 108);
  bigValue(ctx, String(missionState.score), width - 150, 110, 22);

  // --- Bottom left: artificial horizon + throttle ---
  panel(ctx, 14, height - 118, 150, 104);
  drawArtificialHorizon(ctx, 89, height - 72, 27, plane);
  label(ctx, 'ATTITUDE', 26, height - 104);
  gaugeBar(ctx, 26, height - 32, 126, 10, plane.throttle, '#7fb2dd',
    `THR ${Math.round(plane.throttle * 100)}%`);

  // --- Bottom centre: mission objective and next-ring guidance ---
  const ring = nextRing(missionState);
  const objective = missionState.finished
    ? 'MISSION COMPLETE'
    : missionState.mission.landing && missionState.ringIndex >= missionState.mission.rings.length
      ? 'LAND ON RUNWAY 36'
      : ring ? `RING ${missionState.ringIndex + 1} OF ${missionState.mission.rings.length}` : '';
  panel(ctx, width / 2 - 210, height - 64, 420, 50);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${missionState.mission.name.toUpperCase()} — ${objective}`, width / 2, height - 42);
  if (ring) {
    const bearing = bearingTo(plane, ring);
    const arrow = bearing > 0.12 ? '▶ TURN RIGHT' : bearing < -0.12 ? '◀ TURN LEFT' : '▲ ON COURSE';
    const dist = Math.round(distanceTo(plane, ring));
    ctx.fillStyle = '#ffb020';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${arrow}   ${dist} m`, width / 2, height - 22);
  } else if (missionState.mission.landing && !missionState.finished) {
    ctx.fillStyle = '#ffb020';
    ctx.font = '13px sans-serif';
    ctx.fillText('FINAL APPROACH — KEEP IT SLOW AND LEVEL', width / 2, height - 22);
  }

  // Ring-passed flash.
  if (missionState.ringFlash > 0) {
    ctx.globalAlpha = clamp(missionState.ringFlash, 0, 1);
    ctx.fillStyle = '#ffb020';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RING CLEAR!', width / 2, height * 0.3);
    ctx.globalAlpha = 1;
  }

  // Centre message line (score popups, warnings), with a dark backing so it
  // reads over bright mountains as well as over the ground.
  if (missionState.messageTime > 0) {
    ctx.globalAlpha = clamp(missionState.messageTime, 0, 1) * 0.55;
    ctx.fillStyle = '#0a1422';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(missionState.message).width;
    ctx.fillRect(width / 2 - tw / 2 - 12, height * 0.30 - 22, tw + 24, 30);
    ctx.globalAlpha = clamp(missionState.messageTime, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(missionState.message, width / 2, height * 0.30);
    ctx.globalAlpha = 1;
  }

  // Warnings the pilot cannot miss.
  if (plane.fuel < 25 && plane.fuel > 0) {
    ctx.fillStyle = time % 1 < 0.5 ? '#ff5a3c' : '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOW FUEL — LAND SOON', width / 2, 84);
  }
  if (plane.fuel <= 0) {
    ctx.fillStyle = '#ff5a3c';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OUT OF FUEL — GLIDING', width / 2, 84);
  }
  if (plane.stalled) {
    ctx.fillStyle = '#ff5a3c';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL! PUSH THE NOSE DOWN', width / 2, 108);
  }
}
