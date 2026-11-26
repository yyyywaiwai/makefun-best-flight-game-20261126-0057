// audio.js — every sound is synthesized with WebAudio: the engine drone, wind,
// a ring chime, a landing thud and a crash. No audio files, nothing to load.

export function createAudio() {
  return {
    context: null,
    engineOsc: null,
    engineGain: null,
    windSource: null,
    windGain: null,
    muted: false,
    started: false,
  };
}

function ensureContext(audio) {
  if (audio.context) return audio.context;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audio.context = new Ctx();
  // Engine: two detuned saws through a low-pass, the classic prop drone.
  audio.engineOsc = audio.context.createOscillator();
  audio.engineOsc.type = 'sawtooth';
  audio.engineOsc.frequency.value = 70;
  const second = audio.context.createOscillator();
  second.type = 'sawtooth';
  second.frequency.value = 71.5;
  const filter = audio.context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  audio.engineGain = audio.context.createGain();
  audio.engineGain.gain.value = 0;
  audio.engineOsc.connect(filter);
  second.connect(filter);
  filter.connect(audio.engineGain);
  audio.engineGain.connect(audio.context.destination);
  audio.engineOsc.start();
  second.start();
  audio.secondOsc = second;
  // Wind: looped noise through a band-pass that opens with speed.
  const noiseLength = audio.context.sampleRate * 2;
  const buffer = audio.context.createBuffer(1, noiseLength, audio.context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) data[i] = Math.random() * 2 - 1;
  audio.windSource = audio.context.createBufferSource();
  audio.windSource.buffer = buffer;
  audio.windSource.loop = true;
  const windFilter = audio.context.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 500;
  audio.windGain = audio.context.createGain();
  audio.windGain.gain.value = 0;
  audio.windSource.connect(windFilter);
  windFilter.connect(audio.windGain);
  audio.windGain.connect(audio.context.destination);
  audio.windSource.start();
  audio.windFilter = windFilter;
  audio.started = true;
  return audio.context;
}

export function startAudio(audio) {
  const ctx = ensureContext(audio);
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function updateEngineSound(audio, plane) {
  if (!audio.started || audio.muted || !audio.engineGain) return;
  const target = plane.landed ? 0 : 0.035 + plane.throttle * 0.05;
  audio.engineGain.gain.setTargetAtTime(target, audio.context.currentTime, 0.1);
  const freq = 55 + plane.throttle * 75 + plane.speed * 0.35;
  audio.engineOsc.frequency.setTargetAtTime(freq, audio.context.currentTime, 0.1);
  audio.secondOsc.frequency.setTargetAtTime(freq * 1.02, audio.context.currentTime, 0.1);
  audio.windGain.gain.setTargetAtTime(Math.min(0.09, plane.speed * 0.0009), audio.context.currentTime, 0.2);
  audio.windFilter.frequency.setTargetAtTime(300 + plane.speed * 8, audio.context.currentTime, 0.2);
}

function playTone(audio, frequency, duration, type = 'sine', volume = 0.12, when = 0) {
  if (!audio.started || audio.muted || !audio.context) return;
  const t0 = audio.context.currentTime + when;
  const osc = audio.context.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = audio.context.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(audio.context.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playRingChime(audio) {
  playTone(audio, 880, 0.35);
  playTone(audio, 1318, 0.5, 'sine', 0.1, 0.08);
}

export function playLandingThud(audio) {
  playTone(audio, 90, 0.3, 'triangle', 0.22);
  playTone(audio, 523, 0.4, 'sine', 0.08, 0.05);
  playTone(audio, 659, 0.4, 'sine', 0.08, 0.14);
  playTone(audio, 784, 0.7, 'sine', 0.1, 0.23);
}

export function playCrashSound(audio) {
  if (!audio.started || audio.muted || !audio.context) return;
  const duration = 0.7;
  const noiseLength = audio.context.sampleRate * duration;
  const buffer = audio.context.createBuffer(1, noiseLength, audio.context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
  const source = audio.context.createBufferSource();
  source.buffer = buffer;
  const gain = audio.context.createGain();
  gain.gain.value = 0.3;
  source.connect(gain);
  gain.connect(audio.context.destination);
  source.start();
  playTone(audio, 55, 0.8, 'triangle', 0.25);
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.engineGain) audio.engineGain.gain.value = 0;
  if (audio.windGain) audio.windGain.gain.value = 0;
  return audio.muted;
}
