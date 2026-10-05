// 01-walk.js (example): the walker crosses a field while the camera follows with lag; captions land on their
// onsets; a star falls at real gravity and lands on the hit with a flash, a shake and sparks.
scene('walk', { t0: TIMING.scenes.walk, tempo: 'normal' }, (t, lt, L) => {
  const who = { id: 'walker', x0: -520, speed: 150 };
  const hipX = s => walkerGait(s, who).hip[0];
  const PX_PER_M = 130;                                     // the walker is about 1.7 m tall
  const drop = 4, landX = hipX(TIMING.hit) + 520, t0 = TIMING.hit - fallTime(drop);

  // camera: trails the walker (follow), leads a little, shakes on the hit
  const [sx, sy, sr] = shake(t, [TIMING.hit], 16);
  cam(follow(hipX, t, .5, .9, 3) + 140 + sx, -230 + sy, 1, sr);

  // background: sky in screen space, distant hills with parallax, ground in the world
  screen(L.bg);
  const sky = L.bg.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1d2a44'); sky.addColorStop(1, '#46597a');
  L.bg.fillStyle = sky; L.bg.fillRect(0, 0, W, H);
  L.bg.fillStyle = '#2f3f5c'; L.bg.beginPath(); L.bg.moveTo(0, H);
  for (let x = 0; x <= W; x += 40) L.bg.lineTo(x, H * .62 - 70 * (1 + noise((x + CAM.x * .3) / 380, 4)));
  L.bg.lineTo(W, H); L.bg.fill();
  cam(CAM.x, CAM.y, CAM.z, CAM.r);                          // back to world space for the ground
  L.bg.fillStyle = '#35422f'; L.bg.fillRect(CAM.x - 2000, 0, 4000, 1500);
  L.bg.fillStyle = '#4b5c41';
  for (let i = Math.floor((CAM.x - 1200) / 170); i < (CAM.x + 1200) / 170; i++) { const r = rng(i); L.bg.fillRect(i * 170 + r() * 90, 10 + r() * 180, 26 + r() * 30, 7); }

  drawWalker(L.main, t, who);

  // the star: real fall time for its height, a smear while it's fast, then a squash, sparks and a flash on the hit
  const star = s => [landX, -(drop * PX_PER_M) + fallen(s - t0) * PX_PER_M - 40];
  if (t >= t0) {
    const x = L.main, landed = t >= TIMING.hit, [px, py] = landed ? [landX, -40] : star(t), h = hop(t, TIMING.hit + .05, TIMING.hit + .45, 70);
    const shape = c => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? 17 : 40; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); };
    if (!landed && vel(star, t)[1] > 700) { mark.plan('smear'); x.fillStyle = 'rgba(255,214,90,.35)'; smear(x, star, t, .06, 4, c => { shape(c); c.fill(); }); }
    x.save(); x.translate(px, py + (landed ? h.dy : 0)); x.scale(1 + h.sq, 1 - h.sq);
    shape(x); x.fillStyle = '#ffd65a'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#8a5a10'; x.stroke(); x.restore();
    mark.box(x, 'star', 'prop', px - 40, py - 40 + (landed ? h.dy : 0), 80, 80);
    mark.point(x, 'star', px, py + (landed ? h.dy : 0));
  }
  particles(t, { rate: 240, life: .7, from: TIMING.hit, to: TIMING.hit + .04, seed: 9 }, (r, age, k) => {
    const a = -Math.PI * r(), v = 300 + 500 * r();
    L.fx.fillStyle = `rgba(255,230,140,${1 - k})`;
    L.fx.beginPath(); L.fx.arc(landX + Math.cos(a) * v * age, -40 + Math.sin(a) * v * age + 700 * age * age, 5 * (1 - k) + 1, 0, TAU); L.fx.fill();
  });
  const flash = t >= TIMING.hit ? Math.exp(-(t - TIMING.hit) * 22) : 0;
  if (flash > .02) { screen(L.fx); L.fx.fillStyle = `rgba(255,250,235,${.7 * flash})`; L.fx.fillRect(0, 0, W, H); mark.plan('flash', 'shake'); }

  // captions: each word appears at its onset (never before), fully in within 0.15 s
  const x = L.text; screen(x); x.font = '700 72px system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  const line = TIMING.words.map(w => w.w).join(' '), y = H - 120;
  let cx = W / 2 - x.measureText(line).width / 2;
  for (const w of TIMING.words) {
    const k = ease(seg(t, w.s, w.s + .15));
    if (k > 0) { x.globalAlpha = k; x.fillStyle = '#fff6e6'; mark.fillText(x, 'w:' + w.w, w.w, cx, y + 16 * (1 - k), { onset: w.s }); x.globalAlpha = 1; }
    cx += x.measureText(w.w + ' ').width;
  }
});
