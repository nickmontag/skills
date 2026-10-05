// walker.js: an example character (replace it with yours). Legs come from gait() + ik2(), so planted feet never
// slide; arms counter-swing; the head bobs a little behind the hips; the head has a crescent shadow and blinks.
// Drawn in world pixels with the ground at y = 0. It marks its box and tracks its hip and feet for the checks.
const WALKER = { thigh: 118, shin: 112, upper: 88, fore: 84, hipH: 222, torso: 168, head: 46, ink: '#f2ece0', shade: '#b9ad98', line: 14 };
const walkerGait = (t, o) => gait(t, { x0: o.x0, speed: o.speed, stride: o.stride ?? 260, D: .6, lift: 34, hipH: WALKER.hipH, bob: 8 });

function drawWalker(ctx, t, o) {
  const P = WALKER, g = walkerGait(twos(t), o), [hx, hy] = g.hip;     // the character moves on twos
  const lagY = follow(s => walkerGait(twos(s), o).hip[1], twos(t), 3, .5, .8) - hy;   // the head lags the hips
  const neck = [hx + 10, hy - P.torso], head = [neck[0] + 6, neck[1] - 58 + lagY];
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = P.line;
  // contact shadows: shrink and fade as each foot lifts
  for (const f of g.feet) { const up = clamp(-f[1] / 40); ctx.fillStyle = `rgba(0,0,0,${.35 * (1 - up)})`; ctx.beginPath(); ctx.ellipse(f[0], 4, 34 * (1 - .4 * up), 9, 0, 0, TAU); ctx.fill(); }
  const limb = (pts, far) => { ctx.strokeStyle = far ? P.shade : P.ink; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
  const leg = i => { const S = [hx + (i ? -8 : 8), hy], F = [g.feet[i][0], g.feet[i][1] - 12], [a1, a2] = ik2(S, F, P.thigh, P.shin, 1);
    const K = [S[0] + P.thigh * Math.cos(a1), S[1] + P.thigh * Math.sin(a1)], A = [K[0] + P.shin * Math.cos(a2), K[1] + P.shin * Math.sin(a2)];
    return [S, K, A, [A[0] + 30, A[1] + 4]]; };
  const arm = i => { const sw = .55 * Math.cos(TAU * (g.c + i / 2 - .05)), S = [neck[0], neck[1] + 16], a1 = Math.PI / 2 - sw, a2 = a1 - .35 - .25 * Math.max(0, sw);
    const El = [S[0] + P.upper * Math.cos(a1), S[1] + P.upper * Math.sin(a1)]; return [S, El, [El[0] + P.fore * Math.cos(a2), El[1] + P.fore * Math.sin(a2)]]; };
  const L1 = leg(1), A1 = arm(1), L0 = leg(0), A0 = arm(0);
  limb(A1, true); limb(L1, true);                                   // far side first
  limb([[hx, hy], neck], false);
  limb(L0, false); limb(A0, false);
  // head: fill, crescent shadow away from the upper-left light, eye that blinks
  const hp = new Path2D(); hp.arc(head[0], head[1], P.head, 0, TAU);
  ctx.fillStyle = P.ink; ctx.fill(hp); crescent(ctx, hp, -14, -12, P.shade);
  const b = blink(t, 1, 2.6), ex = head[0] + 22, ey = head[1] - 6;
  ctx.fillStyle = ctx.strokeStyle = '#1b1b24'; ctx.lineWidth = 5;
  if (b > .5) { ctx.beginPath(); ctx.moveTo(ex - 7, ey); ctx.lineTo(ex + 7, ey); ctx.stroke(); } else { ctx.beginPath(); ctx.ellipse(ex, ey, 6, 9 * (1 - b), 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  // tell the probe: the box the character occupies, and the points worth following
  const xs = [...L0, ...L1, ...A0, ...A1, head].map(p => p[0]);
  mark.box(ctx, o.id, 'char', Math.min(...xs) - 10, head[1] - P.head, Math.max(...xs) - Math.min(...xs) + 20, -head[1] + P.head + 10);
  mark.point(ctx, o.id + '.hip', hx, hy);
  mark.point(ctx, o.id + '.foot0', ...g.feet[0]); mark.point(ctx, o.id + '.foot1', ...g.feet[1]);
}
