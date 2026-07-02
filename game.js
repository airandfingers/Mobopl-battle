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
const VIEW_H = 620;            // world units of height we aim to show
const GRAVITY = 1800;
const CRAWL_SPEED = 300;       // speed along a platform surface
const AIR_ACCEL = 1700;
const AIR_MAX = 400;
const JUMP_SPEED = 800;

const PALETTE = ["#ff8a3d", "#a86bff", "#ff5d8f", "#3ddc84", "#ffd93b", "#4ec9f5"];

// Platforms: axis-aligned rectangles the blob can stick to.
const platforms = [
  { x: 60,   y: 840, w: 260, h: 70 },
  { x: 430,  y: 750, w: 180, h: 56 },
  { x: 700,  y: 630, w: 170, h: 56 },
  { x: 960,  y: 380, w: 80,  h: 430 },  // tall wall — crawl up the side!
  { x: 1130, y: 330, w: 200, h: 56 },
  { x: 1330, y: 130, w: 320, h: 56 },   // ceiling stretch — hang underneath
  { x: 1470, y: 550, w: 180, h: 56 },
  { x: 1690, y: 760, w: 180, h: 62 },
];
platforms.forEach((p, i) => (p.color = PALETTE[i % PALETTE.length]));

const star = { x: 1780, y: 690, r: 26, taken: false, spin: 0 };
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
};

// ---------- input ----------

const input = { x: 0, y: 0, jump: false, jumpBuffer: 0 };

const joyZone = document.getElementById("joy-zone");
const joyBase = document.getElementById("joy-base");
const joyKnob = document.getElementById("joy-knob");
const JOY_RADIUS = 48;
let joyPointer = null;
let joyHome = null; // default base position (zone-relative), captured on first touch

function setJoy(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
  joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  input.x = dx / JOY_RADIUS;
  input.y = dy / JOY_RADIUS;
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

// The other three buttons intentionally do nothing (yet).

// Keyboard fallback for desktop testing.
const keys = {};
addEventListener("keydown", (e) => {
  if (!keys[e.code] && e.code === "Space") input.jumpBuffer = 0.15;
  keys[e.code] = true;
});
addEventListener("keyup", (e) => (keys[e.code] = false));

function keyboardStick() {
  if (joyPointer !== null) return;
  let x = 0, y = 0;
  if (keys["ArrowLeft"] || keys["KeyA"]) x -= 1;
  if (keys["ArrowRight"] || keys["KeyD"]) x += 1;
  if (keys["ArrowUp"] || keys["KeyW"]) y -= 1;
  if (keys["ArrowDown"] || keys["KeyS"]) y += 1;
  if (x || y || (input.x === 0 && input.y === 0)) { input.x = x; input.y = y; }
}

// Block page zoom / scroll gestures.
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault());

// ---------- perimeter geometry ----------
// The blob's center travels along the platform's rectangle expanded
// outward by the blob radius, with quarter-circle arcs at the corners.
// t is arc length, clockwise from the top-left corner of the top edge.

function perimeterLength(p, r) {
  return 2 * (p.w + p.h) + 2 * Math.PI * r;
}

function pointOnPerimeter(p, r, t) {
  const arc = (Math.PI * r) / 2;
  const total = perimeterLength(p, r);
  t = ((t % total) + total) % total;
  let s = t;

  if (s < p.w) return { x: p.x + s, y: p.y - r, nx: 0, ny: -1 };                       // top
  s -= p.w;
  if (s < arc) {                                                                        // top-right corner
    const a = -Math.PI / 2 + (s / arc) * (Math.PI / 2);
    return { x: p.x + p.w + Math.cos(a) * r, y: p.y + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  s -= arc;
  if (s < p.h) return { x: p.x + p.w + r, y: p.y + s, nx: 1, ny: 0 };                   // right
  s -= p.h;
  if (s < arc) {                                                                        // bottom-right corner
    const a = (s / arc) * (Math.PI / 2);
    return { x: p.x + p.w + Math.cos(a) * r, y: p.y + p.h + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  s -= arc;
  if (s < p.w) return { x: p.x + p.w - s, y: p.y + p.h + r, nx: 0, ny: 1 };             // bottom
  s -= p.w;
  if (s < arc) {                                                                        // bottom-left corner
    const a = Math.PI / 2 + (s / arc) * (Math.PI / 2);
    return { x: p.x + Math.cos(a) * r, y: p.y + p.h + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  s -= arc;
  if (s < p.h) return { x: p.x - r, y: p.y + p.h - s, nx: -1, ny: 0 };                  // left
  s -= p.h;
  const a = Math.PI + (s / arc) * (Math.PI / 2);                                        // top-left corner
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
}

// Arc-length t of the perimeter point nearest to world point (cx, cy).
function nearestT(p, r, cx, cy) {
  const arc = (Math.PI * r) / 2;
  const qx = Math.max(p.x, Math.min(p.x + p.w, cx));
  const qy = Math.max(p.y, Math.min(p.y + p.h, cy));
  const onRight = qx === p.x + p.w, onLeft = qx === p.x;
  const onBottom = qy === p.y + p.h, onTop = qy === p.y;
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
  if (onTop && cy <= qy) return qx - p.x;
  if (onRight && cx >= qx) return p.w + arc + (qy - p.y);
  if (onBottom && cy >= qy) return p.w + arc + p.h + arc + (p.x + p.w - qx);
  return 2 * p.w + p.h + 3 * arc + (p.y + p.h - qy); // left edge
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
  star.taken = false;
  hideBanner();
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

function tryStick(prevX, prevY) {
  if (blob.noStickTimer > 0) return;
  for (const p of platforms) {
    const qx = Math.max(p.x, Math.min(p.x + p.w, blob.x));
    const qy = Math.max(p.y, Math.min(p.y + p.h, blob.y));
    let dx = blob.x - qx, dy = blob.y - qy;
    let d = Math.hypot(dx, dy);
    if (d >= blob.r && d > 0) continue;
    if (d === 0) { dx = blob.x - prevX; dy = blob.y - prevY; d = Math.hypot(dx, dy) || 1; dx = -dx; dy = -dy; }
    // Stick!
    blob.attached = p;
    blob.t = nearestT(p, blob.r, blob.x, blob.y);
    const pt = pointOnPerimeter(p, blob.r, blob.t);
    blob.x = pt.x; blob.y = pt.y;
    blob.nx = pt.nx; blob.ny = pt.ny;
    const impact = Math.abs(blob.vx * pt.nx + blob.vy * pt.ny);
    blob.squash = Math.min(0.45, impact / 1400);
    blob.vx = 0; blob.vy = 0;
    return;
  }
}

function update(dt) {
  keyboardStick();
  input.jumpBuffer = Math.max(0, input.jumpBuffer - dt);
  blob.noStickTimer = Math.max(0, blob.noStickTimer - dt);
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

  if (blob.attached) {
    const p = blob.attached;
    // Crawl: project stick input onto the surface tangent (clockwise = (-ny, nx)).
    const tx = -blob.ny, ty = blob.nx;
    const along = input.x * tx + input.y * ty;
    blob.t += along * CRAWL_SPEED * dt;
    const pt = pointOnPerimeter(p, blob.r, blob.t);
    blob.x = pt.x; blob.y = pt.y;
    blob.nx = pt.nx; blob.ny = pt.ny;

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
    const prevX = blob.x, prevY = blob.y;
    blob.x += blob.vx * dt;
    blob.y += blob.vy * dt;
    tryStick(prevX, prevY);
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
  const zoom = Math.max(ch / VIEW_H, cw / WORLD.w);
  const vw = cw / zoom, vh = ch / zoom;

  cam.x += (blob.x - cam.x) * 0.12;
  cam.y += (blob.y - 60 - cam.y) * 0.12;

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
  // Body.
  roundRect(p.x, p.y, p.w, p.h, 14);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,40,80,0.35)";
  ctx.stroke();
  // Glossy top highlight.
  roundRect(p.x + 6, p.y + 5, p.w - 12, Math.min(14, p.h * 0.3), 8);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fill();
  // Cartoon dots.
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  for (let dx = 22; dx < p.w - 12; dx += 44) {
    for (let dy = 26; dy < p.h - 10; dy += 40) {
      ctx.beginPath();
      ctx.arc(p.x + dx, p.y + dy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

function drawBlob(time) {
  const b = blob;
  ctx.save();
  ctx.translate(b.x, b.y);

  // Orient squash along the surface normal (or vertical in the air).
  const ang = b.attached ? Math.atan2(b.ny, b.nx) + Math.PI / 2 : 0;
  ctx.rotate(ang);
  const sq = b.squash;
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
