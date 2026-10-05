// kit.test.mjs: checks the maths in src/kit.js without a browser. Run: npm test
// Canvas-only helpers (trim, letters, crescent, smear, stretchAlong) are exercised by the example scenes instead.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ W: 1920, H: 1080, FPS: 24, console });
const K = vm.runInContext(readFileSync(new URL('../src/kit.js', import.meta.url), 'utf8') + '\n;KIT', ctx);
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// randomness is deterministic and in range
{ const a = K.rng(7), b = K.rng(7), c = K.rng(8); const xs = [a(), a(), a()], ys = [b(), b(), b()];
  ok(xs.every((x, i) => x === ys[i]), 'rng: same seed, same sequence');
  ok(xs[0] !== c(), 'rng: different seed differs');
  let lo = 1, hi = 0; const r = K.rng(1); for (let i = 0; i < 1e4; i++) { const x = r(); lo = Math.min(lo, x); hi = Math.max(hi, x); }
  ok(lo >= 0 && hi < 1, 'rng: in [0, 1)');
  ok(near(K.noise(3.2, 1), K.noise(3.2 + 1e-7, 1), 1e-4), 'noise: continuous'); }

// easing ends where it should
for (const [n, f] of Object.entries(K.E)) ok(near(f(0), 0) && near(f(1), 1), `E.${n}: 0 → 0 and 1 → 1`);
ok(K.E.outBack(0) === 0, 'E.outBack(0) is exactly 0');
ok(Math.max(...Array.from({ length: 99 }, (_, i) => K.E.outBack(i / 99))) > 1, 'E.outBack overshoots');

// keyframes and springs
ok(K.kf(-1, [[0, 5], [1, 9]]) === 5 && K.kf(2, [[0, 5], [1, 9]]) === 9 && near(K.kf(.5, [[0, 5], [1, 9]]), 7), 'kf: ends and middle');
ok(K.spring(0) === 0 && near(K.spring(10), 1, 1e-4), 'spring: 0 at start, settles at 1');
ok(Math.max(...Array.from({ length: 200 }, (_, i) => K.spring(i / 100))) > 1.05, 'spring: overshoots');
ok(near(K.springKeys(20, [[0, 0], [1, 10], [2, -4]]), -4, 1e-3), 'springKeys: settles on the last key');

// physics
ok(near(K.fallTime(4.905), 1, 1e-9) && near(K.fallen(1), 4.905, 1e-9), 'fallTime / fallen: 4.905 m in 1 s');

// rigs
{ const S = [0, 0], T = [60, 150], [t1, t2] = K.ik2(S, T, 100, 90, 1);
  const J = [100 * Math.cos(t1), 100 * Math.sin(t1)], end = [J[0] + 90 * Math.cos(t2), J[1] + 90 * Math.sin(t2)];
  ok(near(end[0], T[0], 1e-6) && near(end[1], T[1], 1e-6), 'ik2: reaches a reachable target');
  ok(J[0] > (T[0] / 2), 'ik2: bend = 1 puts the knee on the +x side');
  const far = K.ik2(S, [0, 1000], 100, 90); ok(Number.isFinite(far[0]) && Number.isFinite(far[1]), 'ik2: out of reach stays finite');
  const M = K.pose2world({ hip: [null, 0, 0], knee: ['hip', 0, 100] }, { hip: Math.PI / 2 });
  const knee = K.apply(M.knee, 0, 0); ok(near(knee[0], -100) && near(knee[1], 0), 'pose2world: a child rides its rotated parent'); }

// walk cycle: planted feet never slide, the body moves at `speed`, the cycle closes
{ const o = { speed: 220, stride: 300, D: .6 }, dt = 1 / 480; let slide = 0, prev = K.gait(0, o);
  for (let t = dt; t < 4; t += dt) { const g = K.gait(t, o);
    for (const i of [0, 1]) if (g.feet[i][1] === 0 && prev.feet[i][1] === 0) slide = Math.max(slide, Math.abs(g.feet[i][0] - prev.feet[i][0]));
    prev = g; }
  ok(slide < 1e-9, 'gait: stance feet stay planted');
  ok(near(K.gait(2, o).hip[0], 440, 1e-9), 'gait: hip moves at speed');
  const a = K.gait(0.37, o), b = K.gait(0.37 + o.stride / o.speed, o);
  ok(near(b.feet[0][0] - a.feet[0][0], 300, 1e-9) && near(b.feet[0][1], a.feet[0][1], 1e-9) && near(b.hip[1], a.hip[1], 1e-9), 'gait: one cycle later = one stride on');
  const run = K.gait(0, { D: .35 }); ok(run.feet.every(f => Number.isFinite(f[0])), 'gait: runs work'); }

// follow-through is pure, continuous and converges
{ const drv = t => t < 1 ? 0 : 100;
  ok(K.follow(drv, 1.3) === K.follow(drv, 1.3), 'follow: pure');
  ok(Math.abs(K.follow(drv, 1.3) - K.follow(drv, 1.3 + 1 / 24)) < 40, 'follow: neighbouring frames agree');
  ok(near(K.follow(drv, 6, 2, .3, 3), 100, .5), 'follow: settles on the driver'); }

// hits
{ let mono = true, p = -Infinity; for (let t = 0; t < 3; t += 1 / 96) { const v = K.hitStop(t, [1, 2]); if (v < p - 1e-12) mono = false; p = v; }
  ok(mono, 'hitStop: time never runs backwards');
  ok(near(K.hitStop(1.05, [1]), 1, 1e-12), 'hitStop: frozen during the hold');
  const s = K.shake(12, [1]); ok(Math.hypot(s[0], s[1]) < 1e-6, 'shake: dies away');
  const run = () => { const out = []; K.particles(1.3, { rate: 50, life: .5, seed: 3 }, (r, age) => out.push([r(), age])); return out; };
  const A = run(), B = run(); ok(A.length === B.length && A.every((x, i) => x[0] === B[i][0]), 'particles: deterministic');
  ok(Math.abs(A.length - 25) <= 1, 'particles: rate × life alive'); }

// motion graphics
{ const sq = [[0, 0], [100, 0], [100, 100], [0, 100]], circ = Array.from({ length: 50 }, (_, i) => [50 + 50 * Math.cos(-i / 50 * K.TAU), 50 + 50 * Math.sin(-i / 50 * K.TAU)]);
  const pr = K.morphPair(sq, circ, 64);
  ok(pr[0].length === 64 && pr[1].length === 64, 'morphPair: equal point counts');
  ok(Math.sign(K.area(pr[0])) === Math.sign(K.area(pr[1])), 'morphPair: matching winding');
  ok(near(K.morph(pr, 0)[5][0], pr[0][5][0]) && near(K.morph(pr, 1)[5][1], pr[1][5][1]), 'morph: ends on each shape'); }

// small things
{ let shut = 0, inRange = true; for (let t = 0; t < 32; t += 1 / 24) { const b = K.blink(t, 2); if (b < 0 || b > 1) inRange = false; if (b > 0) shut++; }
  ok(inRange, 'blink: in range');
  ok(shut > 0 && shut < 32 * 24 * .2, 'blink: blinks, but rarely');
  ok(K.twos(0.49) === 5 / 12 && K.drawNo(1) === 12, 'twos / drawNo'); }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
