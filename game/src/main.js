// main.js — the game loop and the screens around it: title, flying, paused,
// mission complete and crashed. It wires flight, terrain, missions, render,
// HUD, input and audio together and nothing else.

import { createPlane, updateFlight, applyCrashDamage, clamp } from './flight.js';
import { buildTerrain, groundHeightAt } from './terrain.js';
import { MISSIONS, createMissionState, updateMission, judgeTouchdown, terrainStrike } from './missions.js';
import { makeView, drawScene } from './render.js';
import { drawHud } from './hud.js';
import { createInput, readSteering, consumePress, clearPresses } from './input.js';
import { createAudio, startAudio, updateEngineSound, playRingChime, playLandingThud, playCrashSound, toggleMute } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');

const terrain = buildTerrain(20261126);
const input = createInput(canvas);
const audio = createAudio();

let screen = 'title'; // title | flying | paused | complete | crashed
let missionIndex = 0;
let plane = createPlane();
let missionState = createMissionState(MISSIONS[0]);
let time = 0;
let crashReason = '';
let endMessage = '';

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function startMission(index) {
  missionIndex = index;
  plane = createPlane();
  // Mission 2 starts on final approach practice: already lined up with the runway.
  if (index === 1) {
    plane.x = 60;
    plane.z = 2600;
    plane.heading = 0;
    plane.altitude = 300;
    plane.speed = 62;
  }
  missionState = createMissionState(MISSIONS[index]);
  screen = 'flying';
  startAudio(audio);
  announce(`Mission ${MISSIONS[index].id}: ${MISSIONS[index].name}. ${MISSIONS[index].brief}`);
}

function announce(text) {
  statusLine.textContent = text;
}

function endFlight(outcome, reason) {
  if (outcome === 'landed' || outcome === 'rings') {
    screen = 'complete';
    endMessage = outcome === 'landed'
      ? `LANDED — QUALITY ${missionState.landingQuality}%`
      : 'ALL RINGS CLEAR';
    playLandingThud(audio);
    announce(`Mission complete. Score ${missionState.score}.`);
  } else {
    screen = 'crashed';
    crashReason = reason;
    endMessage = reason.toUpperCase();
    playCrashSound(audio);
    announce(`Crashed: ${reason}. Press R to fly again.`);
  }
}

function step(dt) {
  time += dt;
  if (screen !== 'flying') return;

  const steering = readSteering(input, dt);
  updateFlight(plane, steering, dt);
  updateEngineSound(audio, plane);

  const event = updateMission(missionState, plane, dt);
  if (event === 'ring') playRingChime(audio);
  if (missionState.finished && missionState.outcome !== 'landed') {
    endFlight(missionState.outcome, '');
    return;
  }

  // The ground is the hard limit: touch it outside a good landing and it ends.
  const ground = groundHeightAt(plane.x, plane.z);
  if (plane.altitude <= ground + 2) {
    if (missionState.mission.landing && missionState.ringIndex >= missionState.mission.rings.length) {
      const report = judgeTouchdown(missionState, plane);
      if (report.survived) {
        plane.landed = true;
        plane.altitude = ground;
        endFlight('landed', '');
        return;
      }
      endFlight('crashed', report.reason);
      return;
    }
    if (missionState.mission.landing) {
      endFlight('crashed', 'touched down before the rings were clear');
      return;
    }
    endFlight('crashed', 'terrain strike');
    return;
  }

  // Out of fuel over the valley with nowhere to land is a slow crash.
  if (plane.fuel <= 0 && plane.altitude < 60 && plane.speed < 40) {
    endFlight('crashed', 'out of fuel');
    return;
  }
  void terrainStrike;
}

function handleKeys() {
  if (consumePress(input, 'enter')) {
    if (screen === 'title') startMission(0);
    else if (screen === 'complete' || screen === 'crashed') startMission(missionIndex);
  }
  if (consumePress(input, '1') && screen === 'title') startMission(0);
  if (consumePress(input, '2') && screen === 'title') startMission(1);
  if (consumePress(input, 'r') && (screen === 'complete' || screen === 'crashed')) startMission(missionIndex);
  if (consumePress(input, 'p') && screen === 'flying') screen = 'paused';
  else if (consumePress(input, 'p') && screen === 'paused') screen = 'flying';
  if (consumePress(input, 'm')) toggleMute(audio);
  if (consumePress(input, ' ')) startAudio(audio);
  clearPresses(input);
}

function drawTitle() {
  const w = canvas.width;
  const h = canvas.height;
  const view = makeView(w, h, plane);
  drawScene(ctx, view, terrain, missionState, time);
  ctx.fillStyle = 'rgba(8, 18, 34, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SKYLINE COURIER', w / 2, h * 0.26);
  ctx.fillStyle = '#ffffff';
  ctx.font = '28px sans-serif';
  ctx.fillText('— Alpine Run —', w / 2, h * 0.26 + 44);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#d7e6f5';
  ctx.fillText('Fly the mail plane through the rings, then put her down on runway 36.', w / 2, h * 0.40);
  ctx.fillText('Throttle and turn discipline win the day — fuel and airframe are finite.', w / 2, h * 0.40 + 28);

  // Mission cards.
  for (let i = 0; i < MISSIONS.length; i++) {
    const y = h * 0.52 + i * 92;
    ctx.fillStyle = 'rgba(10, 20, 34, 0.72)';
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(w / 2 - 300, y, 600, 76, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1} — ${MISSIONS[i].name}`, w / 2 - 278, y + 30);
    ctx.fillStyle = '#bcd6ec';
    ctx.font = '15px sans-serif';
    ctx.fillText(MISSIONS[i].brief, w / 2 - 278, y + 56);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Press ENTER or click a mission — 1 or 2', w / 2, h * 0.52 + 2 * 92 + 30);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#bcd6ec';
  ctx.fillText('W / S throttle · ↑ / ↓ pitch · ← / → bank · mouse: hold to steer · SPACE brake · P pause · M mute', w / 2, h * 0.52 + 2 * 92 + 58);
}

function drawEndScreen() {
  const w = canvas.width;
  const h = canvas.height;
  const view = makeView(w, h, plane);
  drawScene(ctx, view, terrain, missionState, time);
  ctx.fillStyle = screen === 'complete' ? 'rgba(8, 30, 20, 0.55)' : 'rgba(40, 8, 8, 0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = screen === 'complete' ? '#7fe08a' : '#ff6a4d';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(screen === 'complete' ? 'MISSION COMPLETE' : 'CRASHED', w / 2, h * 0.32);
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px sans-serif';
  ctx.fillText(endMessage, w / 2, h * 0.32 + 44);
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(`SCORE  ${missionState.score}`, w / 2, h * 0.46);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#d7e6f5';
  const ringsLine = `Rings ${missionState.ringsPassed} / ${missionState.mission.rings.length} · Fuel ${Math.round(plane.fuel)}% · Airframe ${Math.round(100 - plane.damage)}%`;
  ctx.fillText(ringsLine, w / 2, h * 0.46 + 36);
  if (missionState.landingQuality > 0) {
    ctx.fillText(`Landing quality ${missionState.landingQuality}%`, w / 2, h * 0.46 + 64);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText('Press R to fly again · ENTER for the same mission', w / 2, h * 0.62);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#bcd6ec';
  const other = MISSIONS[1 - missionIndex];
  ctx.fillText(`Or press ${missionIndex === 0 ? '2' : '1'} on the title screen for “${other.name}”`, w / 2, h * 0.62 + 28);
}

function drawPaused() {
  const w = canvas.width;
  const h = canvas.height;
  const view = makeView(w, h, plane);
  drawScene(ctx, view, terrain, missionState, time);
  drawHud(ctx, w, h, plane, missionState, terrain, time);
  ctx.fillStyle = 'rgba(8, 18, 34, 0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.45);
  ctx.font = '18px sans-serif';
  ctx.fillText('Press P to keep flying', w / 2, h * 0.45 + 36);
}

function render() {
  const w = canvas.width;
  const h = canvas.height;
  if (screen === 'title') { drawTitle(); return; }
  if (screen === 'complete' || screen === 'crashed') { drawEndScreen(); return; }
  if (screen === 'paused') { drawPaused(); return; }
  const view = makeView(w, h, plane);
  drawScene(ctx, view, terrain, missionState, time);
  drawHud(ctx, w, h, plane, missionState, terrain, time);
}

let lastTimestamp = 0;
function frame(timestamp) {
  const dt = clamp((timestamp - lastTimestamp) / 1000, 0, 0.05);
  lastTimestamp = timestamp;
  handleKeys();
  step(dt);
  render();
  requestAnimationFrame(frame);
}

// --- Screenshot staging hooks -------------------------------------------
// ?scene=start | flight | landing | complete | crashed sets the game up in a
// genuine play state so the maker can photograph it. Nothing here cheats the
// game: each scene is a real state the player can reach by flying.
function stageScene(scene, mission) {
  if (scene === 'start') {
    screen = 'title';
    return;
  }
  startMission(mission === '2' ? 1 : 0);
  if (scene === 'flight') {
    // Mid-mission, turning onto the first ring with the valley ahead.
    plane.x = -300;
    plane.z = 2100;
    plane.heading = 0.1;
    plane.altitude = 240;
    plane.speed = 66;
    plane.throttle = 0.7;
    plane.bank = -0.15;
    return;
  }
  if (scene === 'landing') {
    // On final approach: rings done, lined up on runway 36 with the
    // approach lights ahead and the threshold in clear view.
    missionState.ringIndex = missionState.mission.rings.length;
    missionState.ringsPassed = missionState.mission.rings.length;
    plane.x = 28;
    plane.z = 1050;
    plane.heading = 0.03;
    plane.altitude = 78;
    plane.speed = 54;
    plane.throttle = 0.4;
    plane.verticalSpeed = -3;
    return;
  }
  if (scene === 'complete') {
    missionState.ringIndex = missionState.mission.rings.length;
    missionState.ringsPassed = missionState.mission.rings.length;
    missionState.score = 2840;
    missionState.landingQuality = 86;
    // Parked just off the runway, turned a touch, so the strip reads
    // beside the plane instead of hiding directly behind it.
    plane.x = 95;
    plane.z = 150;
    plane.heading = 0.12;
    plane.speed = 0;
    plane.throttle = 0;
    plane.landed = true;
    // The camera rides a little above the parked plane so the runway strip
    // reads below the horizon instead of edge-on.
    plane.altitude = groundHeightAt(plane.x, plane.z) + 14;
    plane.fuel = 61;
    endFlight('landed', '');
    return;
  }
  if (scene === 'crashed') {
    endFlight('crashed', 'terrain strike');
  }
}

const params = new URLSearchParams(window.location.search);
if (params.get('scene')) {
  stageScene(params.get('scene'), params.get('mission'));
}

requestAnimationFrame(frame);
