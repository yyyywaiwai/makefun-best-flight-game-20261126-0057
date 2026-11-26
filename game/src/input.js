// input.js — keyboard and mouse, the two ways to fly. The mouse steers by
// position (left/right banks, up/down pitches); the keyboard is the precise
// instrument for throttle and turns. Either works alone.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseX: 0.5, // 0..1 across the canvas
    mouseY: 0.5,
    mouseActive: false,
    mouseSteering: false,
    pressed: new Set(), // keys pressed since the last frame was consumed
  };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    if (!event.repeat) input.pressed.add(event.key.toLowerCase());
    input.keys.add(event.key.toLowerCase());
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.key.toLowerCase());
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseSteering = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (event.clientX - rect.left) / rect.width;
    input.mouseY = (event.clientY - rect.top) / rect.height;
    input.mouseActive = true;
  });
  canvas.addEventListener('mousedown', () => {
    input.mouseSteering = true;
  });
  canvas.addEventListener('mouseup', () => {
    input.mouseSteering = false;
  });

  return input;
}

export function consumePress(input, key) {
  const hit = input.pressed.has(key);
  if (hit) input.pressed.delete(key);
  return hit;
}

export function clearPresses(input) {
  input.pressed.clear();
}

// Turn the current keys and mouse into a steering command for flight.js.
export function readSteering(input, dt) {
  let bankTarget = 0;
  let pitchTarget = 0;
  if (input.keys.has('arrowleft')) bankTarget -= 1;
  if (input.keys.has('arrowright')) bankTarget += 1;
  if (input.keys.has('arrowup')) pitchTarget += 1;
  if (input.keys.has('arrowdown')) pitchTarget -= 1;
  if (input.keys.has('a')) bankTarget -= 1;
  if (input.keys.has('d')) bankTarget += 1;

  // Mouse steering: hold the button and the plane follows the cursor.
  if (input.mouseSteering && input.mouseActive) {
    bankTarget = (input.mouseX - 0.5) * 2.4;
    pitchTarget = (0.5 - input.mouseY) * 2.0;
  }

  let throttleDelta = 0;
  if (input.keys.has('w')) throttleDelta += 0.45;
  if (input.keys.has('s')) throttleDelta -= 0.45;
  if (input.keys.has('shift')) throttleDelta += 0.45;
  if (input.keys.has('control')) throttleDelta -= 0.45;
  if (input.keys.has(' ')) throttleDelta -= 0.25;

  return {
    bankTarget,
    pitchTarget,
    throttleDelta,
    brake: input.keys.has(' '),
    dt,
  };
}
