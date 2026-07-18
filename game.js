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

const WORLD = { w: 1920, h: 1080 };
const WATER_Y = 960;
const VIEW_H = 850;            // world units of height to show (portrait)
const VIEW_H_LANDSCAPE = 610;
const GRAVITY = 1800;
const CRAWL_SPEED = 300;       // speed along a platform surface
const AIR_ACCEL = 1700;
const AIR_MAX = 400;
const JUMP_SPEED = 800;
const DASH_SPEED = 1500;
const DASH_TIME = 0.11;        // ~165 world px — a bit shorter than a jump

const PALETTE = ["#ff8a3d", "#a86bff", "#ff5d8f", "#3ddc84", "#ffd93b", "#4ec9f5"];

// Platforms: rectangles the blob can stick to; `angle` (radians,
// rotation about the rect center, positive = right end tips down)
// makes a slope that rocks roll down.
const platforms = [
  { x: 60,   y: 840, w: 260, h: 70 },
  { x: 430,  y: 750, w: 180, h: 56 },
  { x: 700,  y: 630, w: 170, h: 56 },
  { x: 960,  y: 380, w: 80,  h: 430 },                  // tall wall — crawl up the side!
  { x: 1130, y: 330, w: 200, h: 56, angle: 0.14 },      // tilted — rocks roll off to the right
  { x: 1330, y: 130, w: 320, h: 56 },                   // ceiling stretch — hang underneath
  { x: 1470, y: 550, w: 180, h: 56 },
  { x: 1580, y: 638, w: 240, h: 44, angle: Math.PI / 4 }, // steep ramp down to the star
  { x: 1740, y: 760, w: 180, h: 62 },
];
platforms.forEach((p, i) => { p.angle = p.angle || 0; p.color = PALETTE[i % PALETTE.length]; });

const star = { x: 1830, y: 690, r: 26, taken: false, spin: 0 };
const SPAWN = { x: 170, y: 780 };

// ---------- blob state ----------

const blob = {
  x: SPAWN.x, y: SPAWN.y,
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
  form: "blob",      // blob | rock
  rockTimer: 0,      // seconds left as a rock
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

// The left button intentionally does nothing (yet).

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

// ---------- headphone / media-button controls ----------
// Hardware media buttons (headset play/pause, Bluetooth track skip,
// keyboard ⏯ ⏭ ⏮) reach a web page through the Media Session API,
// but only while the page is actively playing audio. Toggling 🎧 on
// loops a ~10 s inaudible WAV so the browser treats us as the active
// media session and routes the buttons here:
//   play / pause   -> jump
//   next track     -> dash      (double-press on many headsets)
//   previous track -> rock      (triple-press on many headsets)
// Volume buttons and assistant gestures are consumed by the OS and
// are never delivered to the page, so they can't be mapped.

const hpBtn = document.getElementById("btn-hp");
let hpAudio = null;
let hpOn = false;

// Build a 10-second, single-channel WAV of a ~-55 dBFS 50 Hz sine —
// effectively silent, but not muted, so the media session engages.
function quietLoopURL() {
  const rate = 8000, secs = 10, n = rate * secs;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const tag = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  tag(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); tag(8, "WAVE");
  tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 2, Math.sin((i * 2 * Math.PI * 50) / rate) * 60, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function hpAction(fn) {
  return () => {
    fn();
    // Stay "playing" no matter which button fired, so the OS keeps
    // sending events instead of considering us paused.
    navigator.mediaSession.playbackState = "playing";
  };
}

function hpSetHandlers(on) {
  const map = {
    play: hpAction(() => (input.jumpBuffer = 0.15)),
    pause: hpAction(() => (input.jumpBuffer = 0.15)),
    nexttrack: hpAction(startDash),
    previoustrack: hpAction(becomeRock),
  };
  for (const [action, handler] of Object.entries(map)) {
    try {
      navigator.mediaSession.setActionHandler(action, on ? handler : null);
    } catch {
      // Action not supported by this browser — fine, skip it.
    }
  }
}

function hpEnable() {
  if (!hpAudio) {
    hpAudio = new Audio(quietLoopURL());
    hpAudio.loop = true;
  }
  // play() must run inside the tap's gesture to satisfy autoplay rules.
  hpAudio.play().then(() => {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Blob Hop!",
      artist: "⏯ jump · ⏭ dash · ⏮ rock",
    });
    navigator.mediaSession.playbackState = "playing";
    hpSetHandlers(true);
    hpOn = true;
    hpBtn.classList.add("on");
    showBanner("🎧 ⏯ = JUMP", "#b8ff66");
    setTimeout(hideBanner, 1800);
  }).catch(() => {
    showBanner("🎧 BLOCKED", "#ff5d8f");
    setTimeout(hideBanner, 1800);
  });
}

function hpDisable() {
  hpAudio.pause();
  hpSetHandlers(false);
  navigator.mediaSession.playbackState = "none";
  navigator.mediaSession.metadata = null;
  hpOn = false;
  hpBtn.classList.remove("on");
}

if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
  hpBtn.addEventListener("click", () => (hpOn ? hpDisable() : hpEnable()));
} else {
  hpBtn.style.display = "none";
}

// Keyboard fallback for desktop testing.
const keys = {};
addEventListener("keydown", (e) => {
  if (!keys[e.code]) {
    if (e.code === "Space") input.jumpBuffer = 0.15;
    if (e.code === "KeyR") becomeRock();
    if (e.code === "KeyF") startDash();
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

function showBanner(text, color) {
  banner.textContent = text;
  banner.style.color = color || "#fff";
  banner.classList.remove("show");
  void banner.offsetWidth; // restart the pop animation
  banner.classList.add("show");
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
  star.taken = false;
  hideBanner();
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

function die() {
  blob.state = "dead";
  blob.stateTimer = 0;
  blob.attached = null;
  burst(blob.x, WATER_Y, ["#4ec9f5", "#8fdcff", "#ffffff", "#2a9fd8"], 26, 420, 350);
  showBanner("SPLASH!", "#8fdcff");
}

function win() {
  blob.state = "won";
  blob.stateTimer = 0;
  star.taken = true;
  burst(star.x, star.y, PALETTE, 40, 500, 250);
  showBanner("YOU WIN!", "#ffd93b");
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

  if (blob.state === "dead") {
    blob.stateTimer += dt;
    blob.y += 60 * dt; // sink
    if (blob.stateTimer > 1.6) resetLevel();
    updateParticles(dt);
    return;
  }
  if (blob.state === "won") {
    blob.stateTimer += dt;
    if (blob.stateTimer > 2.4) resetLevel();
    updateParticles(dt);
    return;
  }

  if (blob.form === "rock") {
    updateRock(dt);
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
    // Airborne.
    blob.vx += input.x * AIR_ACCEL * dt;
    blob.vx = Math.max(-AIR_MAX, Math.min(AIR_MAX, blob.vx));
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

const cam = { x: SPAWN.x, y: SPAWN.y };

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

  // Parallax clouds.
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = 0; i < 6; i++) {
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
  for (let i = 0; i < 5; i++) {
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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
