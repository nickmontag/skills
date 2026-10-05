// kit.js: pure helpers for code-drawn animation. Every function depends only on its arguments (no stored state,
// no Math.random), so any frame can be drawn in any order. It's a classic script: W, H and FPS come from
// config.js and are read when a function runs. How and when to use each helper: references/motion-craft.md.
// Tests: `npm test` (tests/kit.test.mjs). Add to it rather than re-typing helpers inside scenes.

// ---------------- numbers and randomness ----------------
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));                 // 0 before a, 1 after b, linear between
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
// seeded generator: rng(seed)() gives the same sequence for the same seed. Key seeds on stable ids, never draw order.
function rng(seed) { let s = (Math.floor(seed * 9973) ^ 0x9e3779b9) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// smooth deterministic wobble in [-1, 1]
function noise(x, seed = 0) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i + seed * 101.3), hash(i + 1 + seed * 101.3), u) * 2 - 1; }
const twos = t => Math.floor(t * 12 + 1e-6) / 12;                   // feed characters twos(t); keep the camera on t
const drawNo = t => Math.floor(t * 12 + 1e-6);                      // drawing number on twos, for boil seeds

// ---------------- timing and spacing ----------------
// One easing family per piece (a "motion language"). outBack guards x = 0, which would round to -2e-16.
const E = {
  lin: x => x,
  smooth: x => x * x * (3 - 2 * x),
  inC: x => x ** 3,
  outC: x => 1 - (1 - x) ** 3,
  inOut: x => x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2,
  outExpo: x => x >= 1 ? 1 : 1 - 2 ** (-10 * x),
  outBack: (x, s = 1.7) => x <= 0 ? 0 : 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
};
const ease = x => E.smooth(clamp(x)), easeOut = x => E.outC(clamp(x));
// keyframes: kf(t, [[t0, v0], [t1, v1], ...], easing) with numbers or arrays
function kf(t, keys, e = ease) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) {
    const [a, va] = keys[i - 1], [b, vb] = keys[i], k = e((t - a) / (b - a));
    return Array.isArray(va) ? va.map((v, j) => lerp(v, vb[j], k)) : lerp(va, vb, k);
  }
  return keys[keys.length - 1][1];
}
// underdamped spring step: 0 → 1 from tau = 0, overshooting and settling. f in Hz, zeta < 1.
function spring(tau, f = 3, zeta = .4) {
  if (tau <= 0) return 0;
  const w = TAU * f, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * tau) * (Math.cos(wd * tau) + zeta * w / wd * Math.sin(wd * tau));
}
// keyframes where every change is a spring step; steps superpose, so a new key can interrupt a move still settling
function springKeys(t, keys, f = 3, zeta = .4) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], f, zeta);
  return v;
}
// a squash-and-stretch hop from t0 to t1 of height h: returns { dy, sq } (sq > 0 squashes, < 0 stretches)
function hop(t, t0, t1, h) {
  if (t < t0 - .12) return { dy: 0, sq: 0 };
  if (t < t0) return { dy: 0, sq: .18 * ease(seg(t, t0 - .12, t0)) };
  if (t < t1) { const k = (t - t0) / (t1 - t0); return { dy: -h * 4 * k * (1 - k), sq: -.16 * Math.abs(1 - 2 * k) }; }
  const a = t - t1; return { dy: 0, sq: .22 * Math.exp(-8 * a) * Math.cos(20 * a) };
}
// a point along a curved path from a to b; bulge > 0 bows it to one side, < 0 to the other
function arc(a, b, k, bulge = .25) {
  const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bulge, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bulge, u = 1 - k;
  return [u * u * a[0] + 2 * u * k * mx + k * k * b[0], u * u * a[1] + 2 * u * k * my + k * k * b[1]];
}
// blinks: one per slot at a seeded moment, 5 frames long. 0 = open, 1 = shut.
function blink(t, seed = 0, every = 3.2) {
  const n = Math.floor(t / every), t0 = (n + .15 + .6 * rng(seed * 131 + n)()) * every, a = (t - t0) * 24;
  return a < 0 || a >= 5 ? 0 : [.5, 1, 1, .6, .25][Math.floor(a)];
}
// real physics for real-world objects: seconds to fall h metres, and metres fallen after s seconds
const fallTime = (h, g = 9.81) => Math.sqrt(2 * Math.max(0, h) / g);
const fallen = (s, g = 9.81) => .5 * g * Math.max(0, s) ** 2;

// ---------------- rigs ----------------
// 2D affine matrices as [a, b, c, d, e, f], the order ctx.setTransform / ctx.transform take
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const TR = (x, y, r = 0, s = 1) => { const c = Math.cos(r) * s, si = Math.sin(r) * s; return [c, si, -si, c, x, y]; };
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const angleOf = m => Math.atan2(m[1], m[0]);
// rig: { bone: [parent, pivotX, pivotY] } with each pivot in its parent's space; bones point down (+y) at angle 0.
// pose: { bone: radians }. Returns every bone's world matrix.
function pose2world(rig, pose, root = TR(0, 0)) {
  const M = {};
  const get = n => M[n] ??= mul(rig[n][0] ? get(rig[n][0]) : root, TR(rig[n][1], rig[n][2], pose[n] || 0));
  for (const n in rig) get(n);
  return M;
}
// two-bone IK: world angles (from +x) of the upper and lower bone reaching from joint S toward target T.
// With the limb pointing down, bend = 1 puts the middle joint on the +x side (knees of a character facing +x);
// use -1 for elbows, and flip both when the character faces -x.
function ik2(S, T, a, b, bend = 1) {
  const dx = T[0] - S[0], dy = T[1] - S[1], d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const t1 = Math.atan2(dy, dx) - bend * Math.acos((a * a + d * d - b * b) / (2 * a * d));
  const J = [S[0] + a * Math.cos(t1), S[1] + a * Math.sin(t1)];
  return [t1, Math.atan2(T[1] - J[1], T[0] - J[0])];
}
// pose angles from ik2's world angles: upper = t1 - PI/2 - angleOf(M[parent]); lower = t2 - t1

// ---------------- cycles ----------------
// hip and feet for a walk (or run) along +x at `speed` px/s. D = fraction of the cycle each foot is down
// (walk ≈ .6, run ≈ .35). stride = distance the body travels per full cycle (two steps). Planted feet don't move.
function gait(t, { x0 = 0, ground = 0, speed = 220, stride = 300, D = .6, lift = 40, hipH = 330, bob = 10 } = {}) {
  const c = t * speed / stride;
  const feet = [0, .5].map(off => {
    const u = c + off, n = Math.floor(u), p = u - n, plant = x0 + (n - off + D / 2) * stride;
    if (p < D) return [plant, ground];                                       // stance
    const k = (p - D) / (1 - D);                                             // swing to the next plant
    return [plant + stride * (1 - Math.cos(Math.PI * k)) / 2, ground - lift * Math.sin(Math.PI * k)];
  });
  const up = (D >= .5 ? 1 : -1) * Math.cos(4 * Math.PI * (c - D / 2));       // walk: high at passing; run: in flight
  return { c, hip: [x0 + c * stride, ground - hipH - bob * up], feet };
}

// ---------------- follow-through ----------------
// spring-follow a driver function by replaying a short fixed-step window that ends at t. Still pure: the steps sit
// on an absolute time grid, so neighbouring frames agree. win must cover the settle time, about 5 / (zeta·TAU·f).
function follow(driver, t, f = 2, zeta = .3, win = 1.5, dt = 1 / 240) {
  const w = TAU * f;
  let s = Math.floor((t - win) / dt) * dt, x = driver(s), v = 0;
  for (; s < t; s += dt) { const h = Math.min(dt, t - s); v += (w * w * (driver(s) - x) - 2 * zeta * w * v) * h; x += v * h; }
  return x;
}

// ---------------- fast motion ----------------
const vel = (pos, t, h = 1 / 96) => { const a = pos(t - h), b = pos(t + h); return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)]; };
// volume-preserving stretch along the direction of motion; apply at the object's centre, amount ≈ clamp(speed·k, 0, .6)
function stretchAlong(ctx, vx, vy, amount) { const a = Math.atan2(vy, vx), s = 1 + amount; ctx.rotate(a); ctx.scale(s, 1 / s); ctx.rotate(-a); }
// smear: the shape repeated along its recent path, tapering toward the tail. draw(ctx) fills it at the origin with
// NO outline; draw the outlined shape once, on top, at pos(t).
function smear(ctx, pos, t, span, n, draw) {
  for (let i = n; i >= 0; i--) { const k = i / n, [x, y] = pos(t - k * span); ctx.save(); ctx.translate(x, y); ctx.scale(1 - .5 * k, 1 - .5 * k); draw(ctx); ctx.restore(); }
}
// 180° motion blur: average K sub-frames across the half-frame centred on t. frameAt(ts) draws a complete opaque
// frame into the canvas src; acc is the destination context. Exact for opaque frames (running average).
function blurredFrame(t, K, frameAt, src, acc, fps = FPS) {
  for (let i = 0; i < K; i++) { frameAt(t + ((i + .5) / K - .5) * .5 / fps); acc.globalAlpha = 1 / (i + 1); acc.drawImage(src, 0, 0); }
  acc.globalAlpha = 1;
}

// ---------------- hits and effects ----------------
// camera shake from a list of hit times: [dx, dy, rotation]. Squaring keeps small hits subtle and big ones violent.
function shake(t, hits, amp = 24, decay = 6, freq = 18) {
  let k = 0; for (const h of hits) if (t >= h) k += Math.exp(-(t - h) * decay);
  k = Math.min(k, 1) ** 2;
  return [amp * k * noise(t * freq, 1), amp * k * noise(t * freq, 2), .02 * k * noise(t * freq, 3)];
}
// hit-stop: the action freezes for `hold` at each hit, then carries on. Author post-hit keys in this time.
const hitStop = (t, hits, hold = 3 / 24) => hits.reduce((te, h) => t < h ? te : te - Math.min(t - h, hold), t);
// particles as closed-form functions of age, emitted on a fixed grid of slots and keyed on the slot index.
// each(r, age, k, i): r = the particle's own rng, k = age / life. Call r in the same order every time.
function particles(t, { rate, life, from = -Infinity, to = Infinity, seed = 0 }, each) {
  const i0 = Math.ceil(Math.max(t - life, from) * rate), i1 = Math.floor(Math.min(t, to) * rate);
  for (let i = i0; i <= i1; i++) { const age = t - i / rate; if (age >= 0 && age <= life) each(rng(seed * 7919 + i), age, age / life, i); }
}

// ---------------- camera ----------------
// multiplane: c = { x, y, dolly, zoom }; d = a plane's distance (1 = the action plane, 3 = far hills, .5 = foreground).
// Author each plane at its on-screen size for the resting camera. Skip planes the dolly has passed (d - dolly < .05).
function plane(ctx, c, d) {
  const k = c.zoom / Math.max(d - c.dolly, .05);
  ctx.setTransform(k * d, 0, 0, k * d, W / 2 - c.x * k, H / 2 - c.y * k);
}

// ---------------- motion graphics ----------------
// trim paths: stroke only the part of a polyline between fractions k0 and k1 of its length
function trim(ctx, pts, k0, k1) {
  if (k1 - k0 <= 0) return;
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  ctx.setLineDash([L * (k1 - k0), 2 * L + 1]); ctx.lineDashOffset = -L * k0;
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}
// shape morphs: resample both outlines to n points by arc length, match winding and start point, then lerp
function resample(pts, n) {
  const P = [...pts, pts[0]], L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const out = []; let j = 1;
  for (let i = 0; i < n; i++) {
    const s = i / n * L[L.length - 1]; while (L[j] < s) j++;
    const k = (s - L[j - 1]) / (L[j] - L[j - 1] || 1); out.push([lerp(P[j - 1][0], P[j][0], k), lerp(P[j - 1][1], P[j][1], k)]);
  }
  return out;
}
const area = P => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
function morphPair(A, B, n = 128) {   // once per pair (memoize), not per frame
  A = resample(A, n); B = resample(B, n);
  if (Math.sign(area(A)) !== Math.sign(area(B))) B.reverse();
  let best = 0, bestD = Infinity;
  for (let s = 0; s < n; s++) { let d = 0; for (let i = 0; i < n; i++) { const b = B[(i + s) % n]; d += (A[i][0] - b[0]) ** 2 + (A[i][1] - b[1]) ** 2; } if (d < bestD) { bestD = d; best = s; } }
  return [A, B.map((_, i) => B[(i + best) % n])];
}
const morph = ([A, B], k) => A.map((a, i) => [lerp(a[0], B[i][0], k), lerp(a[1], B[i][1], k)]);
// per-letter animation that keeps the font's kerning: each(i, n) sets this letter's transform / alpha on ctx
function letters(ctx, text, x, y, each) {
  const ch = [...text], total = ctx.measureText(text).width, align = ctx.textAlign;
  ctx.textAlign = 'center';
  ch.forEach((c, i) => {
    const right = ctx.measureText(ch.slice(0, i + 1).join('')).width, cw = ctx.measureText(c).width;
    ctx.save(); ctx.translate(x - total / 2 + right - cw / 2, y); each(i, ch.length); ctx.fillText(c, 0, 0); ctx.restore();
  });
  ctx.textAlign = align;
}

// ---------------- drawing ----------------
// fill the part of `shape` (a Path2D) NOT covered by the same shape shifted by (dx, dy). Shadow: shift toward the
// light, so the crescent lands on the far side. Rim light: shift away from it. (drawing-in-code.md §3)
function crescent(ctx, shape, dx, dy, color) {
  const outside = new Path2D(); outside.rect(-1e5, -1e5, 2e5, 2e5); outside.addPath(shape, new DOMMatrix().translate(dx, dy));
  ctx.save(); ctx.clip(shape); ctx.clip(outside, 'evenodd'); ctx.fillStyle = color; ctx.fillRect(-1e5, -1e5, 2e5, 2e5); ctx.restore();
}

// everything above, in one place (used by the tests, and a quick index of what exists)
const KIT = { TAU, clamp, lerp, seg, bell, hash, rng, noise, twos, drawNo, E, ease, easeOut, kf, spring, springKeys, hop, arc,
  blink, fallTime, fallen, mul, TR, apply, angleOf, pose2world, ik2, gait, follow, vel, stretchAlong, smear, blurredFrame,
  shake, hitStop, particles, plane, trim, resample, area, morphPair, morph, letters, crescent };
