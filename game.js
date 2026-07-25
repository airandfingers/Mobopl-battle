"use strict";

// ============================================================
// Blob Hop! — a sticky-blob platformer
// The blob clings to every side of a platform (top, walls,
// underside) and crawls along its perimeter. Jumping launches
// it off the surface; falling in the water resets the level.
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const banner = document.getElementById("banner");

// ---------- world ----------

const VIEW_H = 850;            // world units of height to show (portrait)
const VIEW_H_LANDSCAPE = 610;
const GRAVITY = 1800;
const CRAWL_SPEED = 300;       // speed along a platform surface
const AIR_MAX = 400;
const AIR_RESPONSE = 12;       // how quickly airborne vx follows the stick
const JUMP_SPEED = 800;
const DASH_SPEED = 1500;
const DASH_TIME = 0.11;        // ~165 world px — a bit shorter than a jump
const FOX_DURATION = 2.5;      // seconds of flight
const FOX_SPEED = 480;         // full-stick flight speed
const FOX_SAG = 260;           // gentle downward pull while gliding
const FOX_FLAP = 340;          // upward kick from the jump button

const PALETTE = ["#ff8a3d", "#a86bff", "#ff5d8f", "#3ddc84", "#ffd93b", "#4ec9f5"];

// Levels. Platforms are rectangles the blob can stick to; `angle`
// (radians, rotation about the rect center, positive = right end tips
// down) makes a slope that rocks roll down.
const LEVELS = [
  {
    name: "Green Hills",
    world: { w: 1920, h: 1080 },
    waterY: 960,
    spawn: { x: 170, y: 780 },
    star: { x: 1830, y: 690 },
    platforms: [
      { x: 60,   y: 840, w: 260, h: 70 },
      { x: 430,  y: 750, w: 180, h: 56 },
      { x: 700,  y: 630, w: 170, h: 56 },
      { x: 960,  y: 380, w: 80,  h: 430 },                  // tall wall — crawl up the side!
      { x: 1130, y: 330, w: 200, h: 56, angle: 0.14 },      // tilted — rocks roll off to the right
      { x: 1330, y: 130, w: 320, h: 56 },                   // ceiling stretch — hang underneath
      { x: 1470, y: 550, w: 180, h: 56 },
      { x: 1580, y: 638, w: 240, h: 44, angle: Math.PI / 4 }, // steep ramp down to the star
      { x: 1740, y: 760, w: 180, h: 62 },
    ],
  },
  {
    // A long gauntlet: precision hops, a ceiling traverse, dash-only
    // gaps, a floating wall-shaft climb, and a rock-ramp run.
    name: "The Gauntlet",
    world: { w: 7400, h: 1080 },
    waterY: 960,
    spawn: { x: 160, y: 780 },
    star: { x: 7230, y: 750 },
    platforms: [
      { x: 60,   y: 840, w: 260, h: 60 },                   // start
      // A: precision hops over open water
      { x: 540,  y: 820, w: 90,  h: 44 },
      { x: 900,  y: 780, w: 80,  h: 44 },
      { x: 1290, y: 820, w: 80,  h: 44 },
      // B: ceiling traverse
      { x: 1630, y: 800, w: 120, h: 50 },
      { x: 1800, y: 640, w: 700, h: 50 },                   // hang under this
      { x: 2540, y: 820, w: 120, h: 50 },                   // drop-off landing
      // C: dash gaps (too wide for a plain jump)
      { x: 2920, y: 780, w: 100, h: 50 },
      { x: 3380, y: 760, w: 90,  h: 50 },
      { x: 3860, y: 760, w: 90,  h: 50 },
      { x: 4340, y: 740, w: 90,  h: 50 },
      // D: floating wall shaft — leap wall to wall, crawl up
      { x: 4700, y: 500, w: 70,  h: 380 },
      { x: 4980, y: 300, w: 70,  h: 380 },
      { x: 5150, y: 140, w: 500, h: 50 },                   // high ceiling run
      // E: rock-ramp run — turn to rock and ride the slopes
      { x: 5700, y: 400, w: 220, h: 50, angle: 0.3 },
      { x: 6020, y: 560, w: 220, h: 50, angle: 0.3 },
      { x: 6340, y: 720, w: 220, h: 50, angle: 0.3 },
      { x: 6680, y: 860, w: 200, h: 60 },                   // catch platform
      // F: one last leap
      { x: 7180, y: 820, w: 100, h: 50 },
    ],
    noFox: true, // the Gauntlet must be earned the hard way
  },
  {
    // Jump-heavy course crawling with critters. Walkers patrol
    // platform tops, flyers bob in the air. Touch one and you pop —
    // unless you're a rock, which squashes them. The wide bay in the
    // middle can only be crossed as a flying fox.
    name: "Enemy Level",
    world: { w: 5200, h: 1080 },
    waterY: 960,
    spawn: { x: 150, y: 780 },
    star: { x: 4820, y: 430 },
    platforms: [
      { x: 60,   y: 840, w: 220, h: 60 },                   // start
      // stair hops up, each guarded
      { x: 420,  y: 760, w: 140, h: 50 },
      { x: 700,  y: 660, w: 140, h: 50 },
      { x: 980,  y: 560, w: 140, h: 50 },
      // descent chain
      { x: 1260, y: 640, w: 110, h: 50 },
      { x: 1500, y: 720, w: 110, h: 50 },
      // ...the great bay: fox flight only (790 gap)
      { x: 2400, y: 600, w: 160, h: 50 },
      // zigzag hops with flyers between
      { x: 2700, y: 500, w: 130, h: 50 },
      { x: 2980, y: 600, w: 130, h: 50 },
      { x: 3260, y: 500, w: 130, h: 50 },
      // low chain
      { x: 3540, y: 700, w: 100, h: 50 },
      { x: 3780, y: 780, w: 100, h: 50 },
      { x: 4020, y: 700, w: 100, h: 50 },
      // final tower
      { x: 4300, y: 420, w: 80,  h: 420 },
      { x: 4460, y: 380, w: 160, h: 50 },
      { x: 4750, y: 500, w: 140, h: 50 },                   // star perch
    ],
    enemies: [
      { type: "walk", x0: 430, x1: 550,  y: 740 },
      { type: "walk", x0: 710, x1: 830,  y: 640 },
      { type: "walk", x0: 990, x1: 1110, y: 540 },
      { type: "walk", x0: 1270, x1: 1360, y: 620 },
      { type: "fly",  x: 1430, y: 560, ampX: 0,   ampY: 90, speed: 2.2 },
      { type: "fly",  x: 2480, y: 360, ampX: 110, ampY: 0,  speed: 1.6 },
      { type: "walk", x0: 2710, x1: 2820, y: 480 },
      { type: "fly",  x: 3060, y: 420, ampX: 0,   ampY: 110, speed: 2.6 },
      { type: "walk", x0: 3270, x1: 3380, y: 480 },
      { type: "walk", x0: 3790, x1: 3870, y: 760 },
      { type: "fly",  x: 4180, y: 560, ampX: 0,   ampY: 130, speed: 2.0 },
      { type: "walk", x0: 4470, x1: 4610, y: 360 },
      { type: "fly",  x: 4690, y: 400, ampX: 0,   ampY: 80, speed: 2.4 },
    ],
  },
  {
    // Hurdle course: rows of poodles doing push-ups on long runways.
    // They rise and sink with each rep — time your jump over them
    // (or bowl them over as a rock). No fox: this one's about jumps.
    name: "Poodle Push-ups",
    world: { w: 4700, h: 1080 },
    waterY: 960,
    spawn: { x: 160, y: 780 },
    star: { x: 4330, y: 620 },
    platforms: [
      { x: 60,   y: 840, w: 240, h: 60 },                   // start
      { x: 380,  y: 820, w: 700, h: 60 },                   // runway 1
      { x: 1280, y: 780, w: 800, h: 60 },                   // runway 2 (with a pair!)
      { x: 2280, y: 660, w: 600, h: 60 },                   // terrace
      { x: 3080, y: 760, w: 500, h: 60 },                   // runway 3
      { x: 3780, y: 700, w: 600, h: 60 },                   // final stretch
    ],
    enemies: [
      { type: "poodle", x: 500,  y: 820 },
      { type: "poodle", x: 720,  y: 820 },
      { type: "poodle", x: 950,  y: 820 },
      { type: "poodle", x: 1400, y: 780 },
      { type: "poodle", x: 1490, y: 780, phase: 2 },        // back-to-back pair
      { type: "poodle", x: 1740, y: 780 },
      { type: "poodle", x: 1960, y: 780 },
      { type: "poodle", x: 2380, y: 660 },
      { type: "poodle", x: 2580, y: 660 },
      { type: "poodle", x: 2780, y: 660 },
      { type: "poodle", x: 3180, y: 760 },
      { type: "poodle", x: 3400, y: 760 },
      { type: "poodle", x: 3880, y: 700 },
      { type: "poodle", x: 4060, y: 700 },
      { type: "poodle", x: 4240, y: 700 },
    ],
    noFox: true,
  },
];

for (const L of LEVELS) {
  L.platforms.forEach((p, i) => { p.angle = p.angle || 0; p.color = PALETTE[i % PALETTE.length]; });
  L.star = { ...L.star, r: 26, taken: false, spin: 0 };
}

// Current-level state, populated by loadLevel().
let levelIndex = 0;
let WORLD, WATER_Y, platforms, star, SPAWN;
let enemies = []; // live instances, rebuilt on every reset

// ---------- blob state ----------

const blob = {
  x: 0, y: 0, // positioned by loadLevel() -> resetLevel()
  vx: 0, vy: 0,
  r: 26,
  attached: null,    // platform we're stuck to (null = airborne)
  t: 0,              // arc-length position along the attached platform's perimeter
  nx: 0, ny: -1,     // surface normal while attached
  squash: 0,         // >0 flattened against surface, <0 stretched
  noStickTimer: 0,   // brief window after jumping where we can't re-stick
  blink: 0,
  state: "alive",    // alive | dead | won
  stateTimer: 0,
  form: "blob",      // blob | rock | fox
  rockTimer: 0,      // seconds left as a rock
  foxTimer: 0,       // seconds left as a flying fox
  rot: 0,            // rock rolling rotation
  vtx: 0, vty: 0,    // current crawl velocity (for momentum when turning to rock)
  dashTimer: 0,      // seconds of dash left
  dashCooldown: 0,
  faceX: 1, faceY: 0, // last stick direction, for dashing with a neutral stick
};

// ---------- input ----------

const input = { x: 0, y: 0, jump: false, jumpBuffer: 0 };

const joyZone = document.getElementById("joy-zone");
const joyBase = document.getElementById("joy-base");
const joyKnob = document.getElementById("joy-knob");
let joyRadius = 48; // recomputed from the base's rendered size on each grab
let joyPointer = null;
let joyHome = null; // default base position (zone-relative), captured on first touch

function setJoy(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len > joyRadius) { dx *= joyRadius / len; dy *= joyRadius / len; }
  joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  input.x = dx / joyRadius;
  input.y = dy / joyRadius;
}

joyZone.addEventListener("pointerdown", (e) => {
  if (joyPointer !== null) return;
  joyPointer = e.pointerId;
  joyZone.setPointerCapture(e.pointerId);
  const zr = joyZone.getBoundingClientRect();
  if (!joyHome) {
    const r = joyBase.getBoundingClientRect();
    joyHome = { left: r.left - zr.left, top: r.top - zr.top, w: r.width, h: r.height };
  }
  joyRadius = joyHome.w / 2 - 14;
  // Re-center the stick under the thumb (base is positioned relative to the zone).
  joyBase.style.left = e.clientX - zr.left - joyHome.w / 2 + "px";
  joyBase.style.top = e.clientY - zr.top - joyHome.h / 2 + "px";
  joyBase.style.bottom = "auto";
  setJoy(0, 0);
});

joyZone.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joyPointer) return;
  const r = joyBase.getBoundingClientRect();
  setJoy(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
});

function joyRelease(e) {
  if (e.pointerId !== joyPointer) return;
  joyPointer = null;
  setJoy(0, 0);
  if (joyHome) {
    joyBase.style.left = joyHome.left + "px";
    joyBase.style.top = joyHome.top + "px";
  }
}
joyZone.addEventListener("pointerup", joyRelease);
joyZone.addEventListener("pointercancel", joyRelease);

document.getElementById("btn-jump").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  input.jumpBuffer = 0.15; // buffered so a hair-early press still jumps
});

document.getElementById("btn-top").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  becomeRock();
});

document.getElementById("btn-right").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  startDash();
});

document.getElementById("btn-left").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  becomeFox();
});

// ---------- chimes ----------

let audioCtx = null;

// A quick ascending arpeggio of soft triangle-wave notes.
function playChime(notes) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    notes.forEach((freq, i) => {
      const t = audioCtx.currentTime + i * 0.07;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch (_) { /* no audio available — play on silently */ }
}

const CHIME_OPEN = [523.25, 659.25, 783.99];            // C5 E5 G5
const CHIME_SELECT = [523.25, 659.25, 783.99, 1046.5];  // C5 E5 G5 C6

// ---------- level selector ----------

const selectPanel = document.getElementById("level-select");

function selectLevel(i) {
  playChime(CHIME_SELECT);
  loadLevel(i);
  showBanner("LEVEL " + (i + 1), "#8fdcff", 1600);
  selectPanel.classList.add("hidden");
}

LEVELS.forEach((L, i) => {
  const b = document.createElement("button");
  b.textContent = (i + 1) + " · " + L.name;
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectLevel(i);
  });
  selectPanel.appendChild(b);
});

// Tap the level label to open/close the selector.
document.getElementById("hud").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const opening = selectPanel.classList.contains("hidden");
  if (opening) {
    playChime(CHIME_OPEN);
    [...selectPanel.children].forEach((b, i) => b.classList.toggle("current", i === levelIndex));
  }
  selectPanel.classList.toggle("hidden", !opening);
});

// ---------- fullscreen ----------

const fsBtn = document.getElementById("btn-fs");

function fsSupported() {
  return document.fullscreenEnabled || document.webkitFullscreenEnabled;
}
function fsActive() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) Promise.resolve(req.call(el)).catch(() => {});
}
function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (exit) Promise.resolve(exit.call(document)).catch(() => {});
}

if (!fsSupported()) {
  fsBtn.style.display = "none"; // e.g. iPhone Safari has no fullscreen API
} else {
  fsBtn.addEventListener("click", () => (fsActive() ? exitFullscreen() : enterFullscreen()));
}

// In landscape on a touch device, go fullscreen on the first tap so the
// browser chrome doesn't eat part of the game.
let fsAutoTried = false;
addEventListener("pointerdown", () => {
  if (fsAutoTried || fsActive() || !fsSupported()) return;
  if (matchMedia("(orientation: landscape)").matches && matchMedia("(pointer: coarse)").matches) {
    fsAutoTried = true;
    enterFullscreen();
  }
}, { capture: true });
matchMedia("(orientation: landscape)").addEventListener?.("change", () => (fsAutoTried = false));

// Keyboard fallback for desktop testing.
const keys = {};
addEventListener("keydown", (e) => {
  if (!keys[e.code]) {
    if (e.code === "Space") input.jumpBuffer = 0.15;
    if (e.code === "KeyR") becomeRock();
    if (e.code === "KeyF") startDash();
    if (e.code === "KeyG") becomeFox();
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit && +digit[1] <= LEVELS.length) selectLevel(+digit[1] - 1);
  }
  keys[e.code] = true;
});
addEventListener("keyup", (e) => (keys[e.code] = false));

function keyboardStick() {
  if (joyPointer !== null) return; // the touch stick owns the input while held
  let x = 0, y = 0;
  if (keys["ArrowLeft"] || keys["KeyA"]) x -= 1;
  if (keys["ArrowRight"] || keys["KeyD"]) x += 1;
  if (keys["ArrowUp"] || keys["KeyW"]) y -= 1;
  if (keys["ArrowDown"] || keys["KeyS"]) y += 1;
  input.x = x;
  input.y = y;
}

// Block page zoom / scroll gestures.
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault());

// ---------- perimeter geometry ----------
// Platforms may be rotated, so all rectangle math happens in the
// platform's local frame, where the rect spans (0,0)-(w,h); results
// are rotated back to world space. The blob's center travels along
// the rectangle expanded outward by the blob radius, with
// quarter-circle arcs at the corners. t is arc length, clockwise
// from the top-left corner of the top edge.

function toLocal(p, wx, wy) {
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  const dx = wx - (p.x + p.w / 2), dy = wy - (p.y + p.h / 2);
  return { x: dx * c + dy * s + p.w / 2, y: -dx * s + dy * c + p.h / 2 };
}

function toWorld(p, lx, ly) {
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  const dx = lx - p.w / 2, dy = ly - p.h / 2;
  return { x: dx * c - dy * s + p.x + p.w / 2, y: dx * s + dy * c + p.y + p.h / 2 };
}

function rotToWorld(p, vx, vy) {
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  return { x: vx * c - vy * s, y: vx * s + vy * c };
}

function perimeterLength(p, r) {
  return 2 * (p.w + p.h) + 2 * Math.PI * r;
}

// Point + outward normal at arc length t, in the local frame.
function localPointOnPerimeter(p, r, t) {
  const arc = (Math.PI * r) / 2;
  const total = perimeterLength(p, r);
  t = ((t % total) + total) % total;
  let s = t;

  if (s < p.w) return { x: s, y: -r, nx: 0, ny: -1 };                                   // top
  s -= p.w;
  if (s < arc) {                                                                        // top-right corner
    const a = -Math.PI / 2 + (s / arc) * (Math.PI / 2);
    return { x: p.w + Math.cos(a) * r, y: Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  s -= arc;
  if (s < p.h) return { x: p.w + r, y: s, nx: 1, ny: 0 };                               // right
  s -= p.h;
  if (s < arc) {                                                                        // bottom-right corner
    const a = (s / arc) * (Math.PI / 2);
    return { x: p.w + Math.cos(a) * r, y: p.h + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  s -= arc;
  if (s < p.w) return { x: p.w - s, y: p.h + r, nx: 0, ny: 1 };                         // bottom
  s -= p.w;
  if (s < arc) {                                                                        // bottom-left corner
    const a = Math.PI / 2 + (s / arc) * (Math.PI / 2);
    return { x: Math.cos(a) * r, y: p.h + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  s -= arc;
  if (s < p.h) return { x: -r, y: p.h - s, nx: -1, ny: 0 };                             // left
  s -= p.h;
  const a = Math.PI + (s / arc) * (Math.PI / 2);                                        // top-left corner
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
}

function pointOnPerimeter(p, r, t) {
  const l = localPointOnPerimeter(p, r, t);
  const w = toWorld(p, l.x, l.y);
  const n = rotToWorld(p, l.nx, l.ny);
  return { x: w.x, y: w.y, nx: n.x, ny: n.y };
}

// Arc-length t of the perimeter point nearest to world point (wx, wy).
function nearestT(p, r, wx, wy) {
  const lc = toLocal(p, wx, wy);
  const cx = lc.x, cy = lc.y;
  const arc = (Math.PI * r) / 2;
  const qx = Math.max(0, Math.min(p.w, cx));
  const qy = Math.max(0, Math.min(p.h, cy));
  const onRight = qx === p.w, onLeft = qx === 0;
  const onBottom = qy === p.h, onTop = qy === 0;
  const corner = (a0, base) => {
    let a = Math.atan2(cy - qy, cx - qx) - a0;
    a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    a = Math.min(a, Math.PI / 2);
    return base + (a / (Math.PI / 2)) * arc;
  };

  if (onTop && onRight && cx >= qx && cy <= qy) return corner(-Math.PI / 2, p.w);
  if (onBottom && onRight && cx >= qx && cy >= qy) return corner(0, p.w + arc + p.h);
  if (onBottom && onLeft && cx <= qx && cy >= qy) return corner(Math.PI / 2, 2 * p.w + arc * 2 + p.h);
  if (onTop && onLeft && cx <= qx && cy <= qy) return corner(Math.PI, 2 * p.w + arc * 3 + 2 * p.h);
  if (onTop && cy <= qy) return qx;
  if (onRight && cx >= qx) return p.w + arc + qy;
  if (onBottom && cy >= qy) return p.w + arc + p.h + arc + (p.w - qx);
  return 2 * p.w + p.h + 3 * arc + (p.h - qy); // left edge
}

// Closest point on (rotated) platform p to world point, plus outward
// normal and distance. Used by both sticking and rock collisions.
function surfaceInfo(p, wx, wy) {
  const lc = toLocal(p, wx, wy);
  const qx = Math.max(0, Math.min(p.w, lc.x));
  const qy = Math.max(0, Math.min(p.h, lc.y));
  const dx = lc.x - qx, dy = lc.y - qy;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { d: 0, nx: 0, ny: -1 };
  const n = rotToWorld(p, dx / d, dy / d);
  return { d, nx: n.x, ny: n.y };
}

// ---------- particles ----------

const particles = [];

function burst(x, y, colors, count, speed, up) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - (up || 0),
      r: 4 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0],
      life: 0.7 + Math.random() * 0.6,
      age: 0,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.age += dt;
    if (q.age >= q.life) { particles.splice(i, 1); continue; }
    q.vy += GRAVITY * 0.5 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
}

// ---------- game flow ----------

let bannerTimeout = null;
function showBanner(text, color, ttl) {
  banner.textContent = text;
  banner.style.color = color || "#fff";
  banner.classList.remove("show");
  void banner.offsetWidth; // restart the pop animation
  banner.classList.add("show");
  clearTimeout(bannerTimeout);
  if (ttl) bannerTimeout = setTimeout(hideBanner, ttl);
}

function hideBanner() {
  banner.classList.remove("show");
  banner.textContent = "";
}

function resetLevel() {
  blob.x = SPAWN.x; blob.y = SPAWN.y;
  blob.vx = 0; blob.vy = 0;
  blob.attached = null;
  blob.squash = 0;
  blob.noStickTimer = 0;
  blob.state = "alive";
  blob.stateTimer = 0;
  blob.form = "blob";
  blob.rockTimer = 0;
  blob.vtx = 0; blob.vty = 0;
  blob.dashTimer = 0;
  blob.dashCooldown = 0;
  blob.faceX = 1; blob.faceY = 0;
  blob.foxTimer = 0;
  star.taken = false;
  cam.x = SPAWN.x; cam.y = SPAWN.y;
  // Respawn this level's enemies.
  enemies = (LEVELS[levelIndex].enemies || []).map((d) => {
    if (d.type === "walk") return { ...d, r: 20, speed: d.speed || 90, alive: true, x: d.x0, dir: 1, anim: Math.random() * 7 };
    if (d.type === "fly") return { ...d, r: 20, alive: true, t: Math.random() * 7, fx: d.x, fy: d.y };
    // poodle: stationary push-upper; py is the bobbing body center
    return { ...d, r: 24, alive: true, phase: d.phase ?? Math.random() * 6, py: d.y - 26, dir: Math.random() < 0.5 ? -1 : 1 };
  });
  hideBanner();
}

function loadLevel(i) {
  levelIndex = i;
  const L = LEVELS[i];
  WORLD = L.world;
  WATER_Y = L.waterY;
  SPAWN = L.spawn;
  platforms = L.platforms;
  star = L.star;
  document.getElementById("hud").textContent = "LV " + (i + 1) + " · " + L.name;
  document.getElementById("btn-left").classList.toggle("locked", !!L.noFox);
  resetLevel();
}

function startDash() {
  if (blob.state !== "alive" || blob.form !== "blob") return;
  if (blob.dashTimer > 0 || blob.dashCooldown > 0) return;
  // Dash where the stick points; fall back to the last direction held.
  let dx = input.x, dy = input.y;
  if (Math.hypot(dx, dy) < 0.25) { dx = blob.faceX; dy = blob.faceY; }
  const len = Math.hypot(dx, dy) || 1;
  blob.vx = (dx / len) * DASH_SPEED;
  blob.vy = (dy / len) * DASH_SPEED;
  blob.attached = null;
  blob.dashTimer = DASH_TIME;
  blob.dashCooldown = 0.4;
  blob.squash = 0;
  burst(blob.x, blob.y, ["#ffffff", "#b8ff66", "#8fdcff"], 8, 180, 40);
}

const ROCK_DURATION = 3;

function becomeRock() {
  if (blob.state !== "alive" || blob.form !== "blob") return;
  if (blob.attached) {
    // Carry the crawl momentum into the roll.
    blob.vx = blob.vtx;
    blob.vy = blob.vty;
    blob.attached = null;
  }
  blob.form = "rock";
  blob.rockTimer = ROCK_DURATION;
  blob.squash = 0;
  burst(blob.x, blob.y, ["#b8a58c", "#8d7a60", "#ffffff"], 10, 220, 80);
}

function revertToBlob() {
  blob.form = "blob";
  blob.squash = -0.3; // pop back with a stretch
  blob.noStickTimer = 0;
  burst(blob.x, blob.y, ["#b8ff66", "#6fdd2e", "#ffffff"], 10, 220, 80);
}

function becomeFox() {
  if (blob.state !== "alive" || blob.form !== "blob") return;
  if (LEVELS[levelIndex].noFox) return;
  if (blob.attached) {
    // Hop off the surface so we don't instantly land again.
    blob.x += blob.nx * 3;
    blob.y += blob.ny * 3;
    blob.vx = blob.nx * 180 + blob.vtx;
    blob.vy = blob.ny * 180 + blob.vty;
    blob.attached = null;
  }
  blob.form = "fox";
  blob.foxTimer = FOX_DURATION;
  blob.dashTimer = 0;
  blob.squash = 0;
  burst(blob.x, blob.y, ["#ff9d3d", "#ffd9a8", "#ffffff"], 10, 220, 80);
}

// Flying fox: steer freely with the stick, gentle sag when idle,
// flap upward with the jump button. Touching a platform lands and
// reverts; the timer running out drops you back to blob mid-air.
function updateFox(dt) {
  blob.vx += (input.x * FOX_SPEED - blob.vx) * Math.min(1, 4 * dt);
  blob.vy += (input.y * FOX_SPEED - blob.vy) * Math.min(1, 4 * dt) + FOX_SAG * dt;
  if (input.jumpBuffer > 0) {
    input.jumpBuffer = 0;
    blob.vy = Math.max(blob.vy - FOX_FLAP, -FOX_SPEED);
  }
  blob.x += blob.vx * dt;
  blob.y += blob.vy * dt;

  for (const p of platforms) {
    const s = surfaceInfo(p, blob.x, blob.y);
    if (s.d === 0 || s.d >= blob.r) continue;
    blob.form = "blob";
    blob.foxTimer = 0;
    stickTo(p);
    return;
  }

  blob.foxTimer -= dt;
  if (blob.foxTimer <= 0) revertToBlob();
}

function die(cause) {
  blob.state = "dead";
  blob.stateTimer = 0;
  blob.attached = null;
  if (cause === "enemy") {
    burst(blob.x, blob.y, ["#ff5d8f", "#ffd93b", "#ffffff"], 24, 400, 150);
    showBanner("OUCH!", "#ff9db8");
  } else {
    burst(blob.x, WATER_Y, ["#4ec9f5", "#8fdcff", "#ffffff", "#2a9fd8"], 26, 420, 350);
    showBanner("SPLASH!", "#8fdcff");
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.type === "walk") {
      e.anim += dt * 9;
      e.x += e.dir * e.speed * dt;
      if (e.x > e.x1) { e.x = e.x1; e.dir = -1; }
      if (e.x < e.x0) { e.x = e.x0; e.dir = 1; }
    } else if (e.type === "fly") {
      e.t += dt * e.speed;
      e.fx = e.x + Math.sin(e.t) * e.ampX;
      e.fy = e.y + Math.sin(e.t) * e.ampY;
    } else {
      // Push-up rep: body rises and sinks; taller at the top of a rep.
      e.phase += dt * 2.4;
      e.lift = (Math.sin(e.phase) * 0.5 + 0.5) * 34;
      e.py = e.y - 26 - e.lift;
    }
    if (blob.state !== "alive") continue;
    const ex = e.type === "fly" ? e.fx : e.x;
    const ey = e.type === "walk" ? e.y : e.type === "fly" ? e.fy : e.py;
    if (Math.hypot(blob.x - ex, blob.y - ey) < blob.r + e.r - 6) {
      if (blob.form === "rock") {
        // Rocks squash critters.
        e.alive = false;
        burst(ex, ey, ["#a86bff", "#ff5d8f", "#ffffff"], 16, 320, 120);
      } else {
        die("enemy");
      }
    }
  }
}

function win() {
  blob.state = "won";
  blob.stateTimer = 0;
  star.taken = true;
  burst(star.x, star.y, PALETTE, 40, 500, 250);
  showBanner(levelIndex === LEVELS.length - 1 ? "ALL CLEAR!" : "LEVEL CLEAR!", "#ffd93b");
}

// ---------- physics ----------

function stickTo(p) {
  blob.attached = p;
  blob.t = nearestT(p, blob.r, blob.x, blob.y);
  const pt = pointOnPerimeter(p, blob.r, blob.t);
  blob.x = pt.x; blob.y = pt.y;
  blob.nx = pt.nx; blob.ny = pt.ny;
  const impact = Math.abs(blob.vx * pt.nx + blob.vy * pt.ny);
  blob.squash = Math.min(0.45, impact / 1400);
  blob.vx = 0; blob.vy = 0;
}

function tryStick() {
  if (blob.noStickTimer > 0) return;
  for (const p of platforms) {
    const s = surfaceInfo(p, blob.x, blob.y);
    if (s.d >= blob.r && s.d > 0) continue;
    stickTo(p);
    return;
  }
}

// Dash: a straight, gravity-free burst. Hitting a platform head-on
// ends the dash by sticking to it; grazing along a surface doesn't.
function updateDash(dt) {
  blob.dashTimer -= dt;
  blob.x += blob.vx * dt;
  blob.y += blob.vy * dt;
  // Afterimage trail.
  particles.push({
    x: blob.x, y: blob.y, vx: 0, vy: 0, r: blob.r * 0.7,
    color: "rgba(184,255,102,0.4)", life: 0.18, age: 0,
  });

  for (const p of platforms) {
    const s = surfaceInfo(p, blob.x, blob.y);
    if (s.d === 0 || s.d >= blob.r) continue;
    if (blob.vx * s.nx + blob.vy * s.ny < 0) {
      blob.dashTimer = 0;
      stickTo(p);
      return;
    }
  }

  if (blob.dashTimer <= 0) {
    // Keep a gentle carry so the dash doesn't stop dead mid-air.
    blob.vx *= 0.25;
    blob.vy *= 0.25;
  }
}

// Rock mode: plain rolling physics — gravity, bounce a little,
// keep tangential momentum so slopes accelerate the roll.
function updateRock(dt) {
  blob.vy += GRAVITY * dt;
  blob.x += blob.vx * dt;
  blob.y += blob.vy * dt;

  let grounded = false;
  for (const p of platforms) {
    const s = surfaceInfo(p, blob.x, blob.y);
    if (s.d === 0 || s.d >= blob.r) continue;
    grounded = true;
    // Push out of the surface.
    blob.x += s.nx * (blob.r - s.d);
    blob.y += s.ny * (blob.r - s.d);
    // Split velocity into normal + tangential parts.
    const vn = blob.vx * s.nx + blob.vy * s.ny;
    if (vn < 0) {
      const bounce = 1.15; // 1 = kill normal velocity, extra 0.15 = slight bounce
      blob.vx -= s.nx * vn * bounce;
      blob.vy -= s.ny * vn * bounce;
    }
    // Gentle rolling friction on what's left.
    const f = Math.exp(-0.5 * dt);
    blob.vx *= f;
    blob.vy *= f;
    blob.nx = s.nx; blob.ny = s.ny;
  }

  // Spin the sprite with the roll.
  const spinSpeed = grounded
    ? (blob.vx * -blob.ny + blob.vy * blob.nx) // tangential speed on the surface
    : blob.vx;
  blob.rot += (spinSpeed / blob.r) * dt;

  blob.rockTimer -= dt;
  if (blob.rockTimer <= 0) revertToBlob();
}

function update(dt) {
  keyboardStick();
  input.jumpBuffer = Math.max(0, input.jumpBuffer - dt);
  blob.noStickTimer = Math.max(0, blob.noStickTimer - dt);
  blob.dashCooldown = Math.max(0, blob.dashCooldown - dt);
  if (Math.hypot(input.x, input.y) > 0.3) {
    const l = Math.hypot(input.x, input.y);
    blob.faceX = input.x / l;
    blob.faceY = input.y / l;
  }
  blob.squash *= Math.pow(0.001, dt); // spring back to round
  blob.blink -= dt;
  if (blob.blink < -3) blob.blink = 0.13 + Math.random() * 0.1;
  star.spin += dt * 2;
  updateEnemies(dt); // moves critters; may kill or get squashed

  if (blob.state === "dead") {
    blob.stateTimer += dt;
    blob.y += 60 * dt; // sink
    if (blob.stateTimer > 1.6) resetLevel();
    updateParticles(dt);
    return;
  }
  if (blob.state === "won") {
    blob.stateTimer += dt;
    if (blob.stateTimer > 2.4) {
      loadLevel((levelIndex + 1) % LEVELS.length);
      showBanner("LEVEL " + (levelIndex + 1), "#8fdcff", 1600);
    }
    updateParticles(dt);
    return;
  }

  if (blob.form === "rock") {
    updateRock(dt);
  } else if (blob.form === "fox") {
    updateFox(dt);
  } else if (blob.dashTimer > 0) {
    updateDash(dt);
  } else if (blob.attached) {
    const p = blob.attached;
    // Crawl: project stick input onto the surface tangent (clockwise = (-ny, nx)).
    const tx = -blob.ny, ty = blob.nx;
    const along = input.x * tx + input.y * ty;
    blob.t += along * CRAWL_SPEED * dt;
    const pt = pointOnPerimeter(p, blob.r, blob.t);
    blob.x = pt.x; blob.y = pt.y;
    blob.nx = pt.nx; blob.ny = pt.ny;
    // Remember crawl velocity so turning to rock keeps the momentum.
    blob.vtx = along * CRAWL_SPEED * tx;
    blob.vty = along * CRAWL_SPEED * ty;

    if (input.jumpBuffer > 0) {
      input.jumpBuffer = 0;
      // Launch away from the surface, steered by the stick.
      let dx = blob.nx + input.x * 0.9;
      let dy = blob.ny + input.y * 0.9;
      const len = Math.hypot(dx, dy) || 1;
      blob.vx = (dx / len) * JUMP_SPEED;
      blob.vy = (dy / len) * JUMP_SPEED;
      blob.attached = null;
      blob.noStickTimer = 0.12;
      blob.squash = -0.35; // stretch on launch
    }
  } else {
    // Airborne: velocity follows the stick directly, so releasing it
    // stops you mid-air and reversing turns you straight around —
    // no carried momentum.
    blob.vx += (input.x * AIR_MAX - blob.vx) * Math.min(1, AIR_RESPONSE * dt);
    blob.vy += GRAVITY * dt;
    blob.x += blob.vx * dt;
    blob.y += blob.vy * dt;
    tryStick();
  }

  // Star pickup.
  if (!star.taken && Math.hypot(blob.x - star.x, blob.y - star.y) < blob.r + star.r) {
    win();
  }

  // Water is deadly.
  if (blob.y + blob.r * 0.4 > WATER_Y) die();
  // Safety net: out of world sideways.
  if (blob.x < -100 || blob.x > WORLD.w + 100 || blob.y > WORLD.h + 100) die();

  updateParticles(dt);
}

// ---------- camera ----------

const cam = { x: 0, y: 0 };

function cameraTransform() {
  const cw = canvas.width / devicePixelRatio;
  const ch = canvas.height / devicePixelRatio;
  // Landscape screens are short: show fewer world units vertically so
  // the game doesn't shrink to a miniature.
  const viewH = ch >= cw ? VIEW_H : VIEW_H_LANDSCAPE;
  const zoom = Math.max(ch / viewH, cw / WORLD.w);
  const vw = cw / zoom, vh = ch / zoom;

  cam.x += (blob.x - cam.x) * 0.12;
  // Aim a touch below the blob so it rides above screen center,
  // clear of the touch controls at the bottom.
  cam.y += (blob.y + vh * 0.08 - cam.y) * 0.12;

  const cx = Math.max(vw / 2, Math.min(WORLD.w - vw / 2, cam.x));
  const cy = Math.max(vh / 2, Math.min(WORLD.h - vh / 2, cam.y));
  return { zoom, cx, cy, vw, vh };
}

// ---------- drawing ----------

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(cm, time) {
  const cw = canvas.width / devicePixelRatio;
  const ch = canvas.height / devicePixelRatio;

  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, "#37b6ef");
  sky.addColorStop(0.6, "#8fdcff");
  sky.addColorStop(1, "#d9f4ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  // Sun.
  ctx.fillStyle = "#ffd93b";
  ctx.beginPath();
  ctx.arc(cw - 90, 90, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,217,59,0.6)";
  ctx.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + time * 0.3;
    ctx.beginPath();
    ctx.moveTo(cw - 90 + Math.cos(a) * 58, 90 + Math.sin(a) * 58);
    ctx.lineTo(cw - 90 + Math.cos(a) * 72, 90 + Math.sin(a) * 72);
    ctx.stroke();
  }

  // Parallax clouds (count scales with world width so long levels
  // don't end up with empty skies).
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const nClouds = Math.max(6, Math.ceil(WORLD.w / 340));
  for (let i = 0; i < nClouds; i++) {
    const wx = ((i * 420 + time * 18 - cm.cx * 0.25) % (WORLD.w + 400)) - 200;
    const wy = 70 + ((i * 137) % 180);
    const s = 0.7 + (i % 3) * 0.3;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 58 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(wx - 38 * s, wy + 10 * s, 34 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(wx + 40 * s, wy + 9 * s, 38 * s, 21 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant hills.
  ctx.fillStyle = "#7ee29a";
  const nHills = Math.max(5, Math.ceil(WORLD.w / 260));
  for (let i = 0; i < nHills; i++) {
    const hx = ((i * 520 - cm.cx * 0.5) % (WORLD.w + 700)) - 250;
    ctx.beginPath();
    ctx.ellipse(hx, ch + 40, 300, 190 + (i % 2) * 70, 0, Math.PI, 0);
    ctx.fill();
  }
}

function drawPlatform(p) {
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate(p.angle);
  const x = -p.w / 2, y = -p.h / 2;
  // Body.
  roundRect(x, y, p.w, p.h, 14);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,40,80,0.35)";
  ctx.stroke();
  // Glossy top highlight.
  roundRect(x + 6, y + 5, p.w - 12, Math.min(14, p.h * 0.3), 8);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fill();
  // Cartoon dots.
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  for (let dx = 22; dx < p.w - 12; dx += 44) {
    for (let dy = 26; dy < p.h - 10; dy += 40) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStar(time) {
  if (star.taken) return;
  const bob = Math.sin(time * 2.4) * 8;
  ctx.save();
  ctx.translate(star.x, star.y + bob);
  ctx.rotate(Math.sin(star.spin) * 0.25);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? star.r : star.r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffd93b";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#f5a623";
  ctx.stroke();
  ctx.restore();
}

// A poodle mid-push-up: paws planted, fluffy body rising and sinking
// with each rep, topknot bouncing, face straining at the top.
function drawPoodle(e) {
  const lift = e.lift || 0;
  const straining = lift > 24;
  ctx.save();
  ctx.translate(e.x, e.y); // platform top at the poodle's paws
  ctx.scale(e.dir, 1);     // face left or right

  const fluff = "#fff4e3", fluffDark = "#e8d5bd", outline = "#c9a988";

  // Legs: straighten as the body rises.
  ctx.strokeStyle = outline;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 18, -2);
    ctx.lineTo(s * 14, -8 - lift * 0.8);
    ctx.stroke();
  }
  // Paws.
  ctx.fillStyle = fluffDark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 19, -3, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body: horizontal cluster of fluff puffs.
  const by = -26 - lift;
  ctx.fillStyle = fluff;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  for (const [px, pr] of [[-14, 15], [0, 17], [13, 15]]) {
    ctx.beginPath();
    ctx.arc(px, by, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = fluff;
  ctx.beginPath();
  ctx.ellipse(0, by, 26, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pom tail.
  ctx.beginPath();
  ctx.arc(-30, by - 8, 8, 0, Math.PI * 2);
  ctx.fillStyle = fluff;
  ctx.fill();
  ctx.stroke();

  // Head at the front: muzzle, nose, droopy ear, topknot pom.
  const hx = 26, hy = by - 8;
  ctx.beginPath();
  ctx.arc(hx, hy, 12, 0, Math.PI * 2);
  ctx.fillStyle = fluff;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(hx + 10, hy + 3, 7, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = fluffDark;
  ctx.fill();
  ctx.fillStyle = "#3a2a1c";
  ctx.beginPath();
  ctx.arc(hx + 16, hy + 2, 3, 0, Math.PI * 2);
  ctx.fill();
  // Droopy ear.
  ctx.beginPath();
  ctx.ellipse(hx - 6, hy + 9, 5, 9, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = fluffDark;
  ctx.fill();
  ctx.stroke();
  // Topknot bounces opposite the body.
  ctx.beginPath();
  ctx.arc(hx + 2, hy - 14 + lift * 0.15, 8, 0, Math.PI * 2);
  ctx.fillStyle = fluff;
  ctx.fill();
  ctx.stroke();

  // Face: strains at the top of a rep, cheerful otherwise.
  ctx.strokeStyle = "#243040";
  ctx.lineWidth = 2.2;
  if (straining) {
    ctx.beginPath(); // squeezed-shut eye
    ctx.moveTo(hx + 1, hy - 4);
    ctx.lineTo(hx + 7, hy - 3);
    ctx.stroke();
    ctx.fillStyle = "#ff9db8"; // little tongue out
    ctx.beginPath();
    ctx.ellipse(hx + 12, hy + 9, 3, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#243040";
    ctx.beginPath();
    ctx.arc(hx + 4, hy - 3, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawEnemies(time) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.type === "poodle") { drawPoodle(e); continue; }
    const ex = e.type === "walk" ? e.x : e.fx;
    const ey = e.type === "walk" ? e.y : e.fy;
    ctx.save();
    ctx.translate(ex, ey);

    if (e.type === "walk") {
      const hop = Math.abs(Math.sin(e.anim)) * 4;
      ctx.translate(0, -hop);
      // Feet.
      ctx.fillStyle = "#5d3fa8";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * 9, e.r - 2 + hop, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Buzzing wings.
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      const flap = Math.sin(time * 30 + e.t) * 0.5;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * e.r * 0.9, -e.r * 0.5, 12, 6, s * (0.6 + flap), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Spiky round body.
    ctx.beginPath();
    const spikes = 10;
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? e.r : e.r * 0.78;
      i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(-5, -6, 3, 0, 0, e.r * 1.2);
    grad.addColorStop(0, e.type === "walk" ? "#c99cff" : "#ff9db8");
    grad.addColorStop(0.6, e.type === "walk" ? "#a86bff" : "#ff5d8f");
    grad.addColorStop(1, e.type === "walk" ? "#7b3fd6" : "#d63f74");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = e.type === "walk" ? "#4d2b91" : "#a12653";
    ctx.stroke();

    // Angry eyes.
    const look = e.type === "walk" ? e.dir * 3 : Math.sin(e.t) * 2;
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s * 7 + look * 0.4, -3, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#243040";
      ctx.beginPath();
      ctx.arc(s * 7 + look * 0.8, -3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      // Angry brow.
      ctx.strokeStyle = "#243040";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s * 3, -10);
      ctx.lineTo(s * 11, -7);
      ctx.stroke();
    }
    // Grumpy mouth.
    ctx.strokeStyle = "#243040";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 10, 5, 1.2 * Math.PI, 1.8 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }
}

function drawFox(time) {
  const b = blob;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.state === "dead") ctx.globalAlpha = Math.max(0, 1 - b.stateTimer / 1.2);
  const flashing = b.foxTimer < 0.7 && Math.sin(b.foxTimer * 25) > 0;

  // Lean into the direction of travel.
  const lean = Math.atan2(b.vy, Math.abs(b.vx) + 60) * 0.5;
  const facing = b.vx >= 0 ? 1 : -1;
  ctx.scale(facing, 1);
  ctx.rotate(lean * facing);
  const bob = Math.sin(time * 9) * 2;
  ctx.translate(0, bob);

  // Glider membranes (stretch out sideways like a sugar glider).
  ctx.fillStyle = flashing ? "#ffe9c9" : "#e0701a";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-b.r * 0.7, s * 4);
    ctx.quadraticCurveTo(0, s * b.r * 1.5 + Math.sin(time * 12) * 3, b.r * 0.8, s * 5);
    ctx.quadraticCurveTo(0, s * b.r * 0.55, -b.r * 0.7, s * 4);
    ctx.closePath();
    ctx.fill();
  }

  // Fluffy tail.
  ctx.strokeStyle = flashing ? "#fff3dd" : "#ff9d3d";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-b.r * 0.8, 2);
  ctx.quadraticCurveTo(-b.r * 1.5, -6 + Math.sin(time * 7) * 6, -b.r * 2, 0);
  ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-b.r * 1.8, -1 + Math.sin(time * 7) * 1.5);
  ctx.lineTo(-b.r * 2, 0);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Body.
  ctx.beginPath();
  ctx.ellipse(0, 0, b.r * 1.05, b.r * 0.8, 0, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(-6, -8, 4, 0, 0, b.r * 1.3);
  if (flashing) {
    grad.addColorStop(0, "#fff6e6");
    grad.addColorStop(1, "#ffd9a8");
  } else {
    grad.addColorStop(0, "#ffd9a8");
    grad.addColorStop(0.55, "#ff9d3d");
    grad.addColorStop(1, "#e0701a");
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = flashing ? "#e8b96f" : "#b3541a";
  ctx.stroke();

  // Ears.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(b.r * 0.25 + s * 0.1 * b.r, -b.r * 0.6);
    ctx.lineTo(b.r * 0.45 + s * 0.22 * b.r, -b.r * 1.25);
    ctx.lineTo(b.r * 0.72 + s * 0.1 * b.r, -b.r * 0.55);
    ctx.closePath();
    ctx.fillStyle = "#ff9d3d";
    ctx.fill();
    ctx.strokeStyle = "#b3541a";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // White snout + nose at the front.
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(b.r * 0.72, b.r * 0.1, b.r * 0.42, b.r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a1c";
  ctx.beginPath();
  ctx.arc(b.r * 1.05, b.r * 0.05, 4, 0, Math.PI * 2);
  ctx.fill();

  // Eye (happy in flight).
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(b.r * 0.4, -b.r * 0.15, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#243040";
  ctx.beginPath();
  ctx.arc(b.r * 0.48, -b.r * 0.15, 3.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawRock() {
  const b = blob;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.state === "dead") ctx.globalAlpha = Math.max(0, 1 - b.stateTimer / 1.2);
  // Blink white just before reverting.
  const flashing = b.rockTimer < 0.6 && Math.sin(b.rockTimer * 25) > 0;
  ctx.rotate(b.rot);

  // Lumpy boulder outline.
  ctx.beginPath();
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = b.r * (1 + 0.08 * Math.sin(a * 4 + 1.7) + 0.05 * Math.cos(a * 3));
    i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(-8, -10, 4, 0, 0, b.r * 1.3);
  if (flashing) {
    grad.addColorStop(0, "#f4ffe8");
    grad.addColorStop(1, "#c3d9ae");
  } else {
    grad.addColorStop(0, "#c9bda8");
    grad.addColorStop(0.55, "#9c8c72");
    grad.addColorStop(1, "#6f6049");
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = flashing ? "#8fb573" : "#4e4434";
  ctx.stroke();

  // Cracks and speckles so the spin is visible.
  ctx.strokeStyle = "rgba(60,50,35,0.55)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-b.r * 0.5, -b.r * 0.15);
  ctx.lineTo(-b.r * 0.1, 0);
  ctx.lineTo(-b.r * 0.25, b.r * 0.4);
  ctx.moveTo(b.r * 0.2, -b.r * 0.5);
  ctx.lineTo(b.r * 0.45, -b.r * 0.1);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  for (const [sx, sy] of [[-0.3, -0.55], [0.55, 0.25], [0.05, 0.55]]) {
    ctx.beginPath();
    ctx.arc(b.r * sx, b.r * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Squinting determined eyes — it's still our blob in there.
  ctx.strokeStyle = "#3a3226";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-b.r * 0.42, -b.r * 0.18);
  ctx.lineTo(-b.r * 0.16, -b.r * 0.22);
  ctx.moveTo(b.r * 0.16, -b.r * 0.22);
  ctx.lineTo(b.r * 0.42, -b.r * 0.18);
  ctx.stroke();

  ctx.restore();
}

function drawBlob(time) {
  if (blob.form === "rock") { drawRock(); return; }
  if (blob.form === "fox") { drawFox(time); return; }
  const b = blob;
  ctx.save();
  ctx.translate(b.x, b.y);

  // Orient squash along the surface normal (or vertical in the air);
  // while dashing, stretch along the direction of travel instead.
  const dashing = b.dashTimer > 0;
  const ang = dashing
    ? Math.atan2(b.vy, b.vx) + Math.PI / 2
    : b.attached ? Math.atan2(b.ny, b.nx) + Math.PI / 2 : 0;
  ctx.rotate(ang);
  const sq = dashing ? -0.35 : b.squash;
  ctx.scale(1 + sq * 0.9, 1 - sq);

  const wob = 1 + Math.sin(time * 6) * 0.03;

  if (b.state === "dead") ctx.globalAlpha = Math.max(0, 1 - b.stateTimer / 1.2);

  // Body with a wobbly outline.
  ctx.beginPath();
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = b.r * wob * (1 + 0.05 * Math.sin(a * 3 + time * 5));
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr * 1.02;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(-8, -10, 4, 0, 0, b.r * 1.3);
  grad.addColorStop(0, "#b8ff66");
  grad.addColorStop(0.55, "#6fdd2e");
  grad.addColorStop(1, "#43b31a");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#2e8f0f";
  ctx.stroke();

  // Shine.
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-b.r * 0.35, -b.r * 0.45, b.r * 0.28, b.r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Undo rotation so the face stays upright-ish but leans with the surface.
  ctx.rotate(-ang * 0.65);

  // Eyes look toward stick input / velocity.
  let lx = input.x, ly = input.y;
  if (!b.attached) { lx = b.vx / AIR_MAX; ly = b.vy / JUMP_SPEED; }
  const ll = Math.hypot(lx, ly) || 1;
  const lookX = (lx / Math.max(1, ll)) * 4;
  const lookY = (ly / Math.max(1, ll)) * 4;
  const blinking = b.blink > 0;

  for (const side of [-1, 1]) {
    const ex = side * b.r * 0.34, ey = -b.r * 0.18;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(ex, ey, 8.5, blinking ? 1.5 : 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!blinking) {
      ctx.fillStyle = "#243040";
      ctx.beginPath();
      ctx.arc(ex + lookX, ey + lookY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex + lookX - 1.5, ey + lookY - 1.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Mouth: happy normally, big grin when airborne going up, worried falling fast.
  ctx.strokeStyle = "#2e6b0c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (b.state === "won") {
    ctx.arc(0, b.r * 0.2, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (!b.attached && b.vy > 500) {
    ctx.arc(0, b.r * 0.45, 6, 1.15 * Math.PI, 1.85 * Math.PI); // "uh oh"
  } else {
    ctx.arc(0, b.r * 0.18, 7, 0.2 * Math.PI, 0.8 * Math.PI);
  }
  ctx.stroke();

  ctx.restore();
}

function drawWater(cm, time) {
  const left = cm.cx - cm.vw / 2 - 40;
  const right = cm.cx + cm.vw / 2 + 40;

  ctx.save();
  ctx.globalAlpha = 0.85;
  const g = ctx.createLinearGradient(0, WATER_Y, 0, WORLD.h + 200);
  g.addColorStop(0, "#35b5f0");
  g.addColorStop(1, "#0d6fb8");
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(left, WORLD.h + 300);
  ctx.lineTo(left, WATER_Y);
  for (let x = left; x <= right; x += 14) {
    ctx.lineTo(x, WATER_Y + Math.sin(x * 0.025 + time * 2.6) * 8 + Math.sin(x * 0.011 - time * 1.7) * 5);
  }
  ctx.lineTo(right, WORLD.h + 300);
  ctx.closePath();
  ctx.fill();

  // Foam line.
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "#d9f4ff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let x = left; x <= right; x += 14) {
    const y = WATER_Y + Math.sin(x * 0.025 + time * 2.6) * 8 + Math.sin(x * 0.011 - time * 1.7) * 5;
    x === left ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const q of particles) {
    ctx.globalAlpha = 1 - q.age / q.life;
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw(time) {
  const cm = cameraTransform();

  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  drawBackground(cm, time);

  ctx.translate(canvas.width / devicePixelRatio / 2, canvas.height / devicePixelRatio / 2);
  ctx.scale(cm.zoom, cm.zoom);
  ctx.translate(-cm.cx, -cm.cy);

  for (const p of platforms) drawPlatform(p);
  drawStar(time);
  drawEnemies(time);
  drawBlob(time);
  drawWater(cm, time);
  drawParticles();
}

// ---------- boot ----------

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  // Orientation / fullscreen changes move and resize the stick's home;
  // drop the cached position and inline overrides so CSS re-applies.
  joyHome = null;
  joyBase.style.left = "";
  joyBase.style.top = "";
  joyBase.style.bottom = "";
}
addEventListener("resize", resize);
resize();

loadLevel(0);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
