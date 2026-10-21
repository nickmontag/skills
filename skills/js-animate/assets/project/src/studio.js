// studio.js: the timeline engine and the page contract. Scenes draw; this file does everything else.
//
//   scene(name, { t0, dur, tempo, in }, fn)   register a scene. fn(t, lt, L) draws time t (lt = t - the scene's start)
//       into the layers L.bg, L.main, L.text, L.fx (effects, flashes and fades, over everything), as a pure function of time. t0 defaults to the end of the scene
//       before, dur to the start of the next. tempo: 'still' | 'tender' | 'normal' | 'action' (sets the pace limits
//       checks.mjs applies). in: the transition into this scene: { kind: 'cut' | 'dissolve' | 'dip', dur }, or
//       { dur, blend(dst, A, B, k), weights: k => [wA, wB] } for your own.
//   cam(x, y, zoom = 1, rot = 0)              put world point (x, y) at the frame centre, on every layer.
//   screen(ctx)                               switch one layer back to screen pixels (captions, HUD).
//   mark.*                                    tell the probe what's on screen (see below). No cost when not probing.
//   studio.image(src)                         load an image before `ready`; studio.composite can be replaced (WebGL).
//
// Hooks for tools/render.mjs: window.ready, renderAt(t) → PNG data URL, probe(t) → what was on screen at t,
// DURATION, PREROLL, SCENES, META.
// URL: ?t=12.5 · ?scene=name · ?solo=name (only that scene, at any time: for handles) · ?raw (canvas only, 1:1)
//      ?alpha (no background layer, transparent) · ?marks (draw the probe's boxes and tracks over the frame)

const Q = new URLSearchParams(location.search);
const RAW = Q.has('raw'), ALPHA = Q.has('alpha'), SOLO = Q.get('solo');
let showMarks = Q.has('marks');

// ---------------- layers and camera ----------------
const LAYER_NAMES = ['bg', 'main', 'text', 'fx'];   // composite order, back to front: fx (flashes, fades) covers all
const mkCanvas = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const L = {}, LAYER_Z = new Map();
LAYER_NAMES.forEach((n, i) => { L[n] = mkCanvas().getContext('2d'); LAYER_Z.set(L[n], i); });
let CAM = { x: 0, y: 0, z: 1, r: 0 };
function cam(x = 0, y = 0, z = 1, r = 0) {
  CAM = { x, y, z, r };
  const c = Math.cos(r) * z, s = Math.sin(r) * z;
  for (const n of LAYER_NAMES) L[n].setTransform(c, s, -s, c, W / 2 - (c * x - s * y), H / 2 - (s * x + c * y));
}
const screen = ctx => ctx.setTransform(1, 0, 0, 1, 0, 0);
function clearLayers() {
  for (const n of LAYER_NAMES) { const x = L[n]; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H); }
}
function clearFrame(dst) { dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = 1; dst.globalCompositeOperation = 'source-over'; if (ALPHA) dst.clearRect(0, 0, W, H); else { dst.fillStyle = '#000'; dst.fillRect(0, 0, W, H); } }
function defaultComposite(dst) {   // replace studio.composite with a WebGL pass when the look needs one
  clearFrame(dst);
  for (const n of LAYER_NAMES) if (!(ALPHA && n === 'bg')) dst.drawImage(L[n].canvas, 0, 0);
}

// ---------------- scenes and transitions ----------------
const SCENES = [];
function scene(name, opts, fn) {
  const prev = SCENES[SCENES.length - 1];
  SCENES.push({ name, t0: opts.t0 ?? (prev && prev.dur != null ? prev.t0 + prev.dur : 0), dur: opts.dur, tempo: opts.tempo || 'normal', in: opts.in || null, fn });
}
const TRANSITIONS = {
  cut: { blend: (dst, A, B, k) => { clearFrame(dst); dst.drawImage(k < .5 ? A : B, 0, 0); }, weights: k => k < .5 ? [1, 0] : [0, 1] },
  dissolve: { blend: (dst, A, B, k) => { clearFrame(dst); dst.drawImage(A, 0, 0); dst.globalAlpha = ease(k); dst.drawImage(B, 0, 0); dst.globalAlpha = 1; },
    weights: k => [1 - ease(k), ease(k)] },
  dip: { blend: (dst, A, B, k) => { clearFrame(dst); dst.globalAlpha = k < .5 ? ease(1 - 2 * k) : ease(2 * k - 1); dst.drawImage(k < .5 ? A : B, 0, 0); dst.globalAlpha = 1; },
    weights: k => k < .5 ? [ease(1 - 2 * k), 0] : [0, ease(2 * k - 1)], plan: () => ['black'] },   // a dip is dark by design for its whole length
};
const sceneAt = t => { if (SOLO) return SCENES.find(s => s.name === SOLO); let cur = SCENES[0]; for (const s of SCENES) if (s.t0 <= t + 1e-9) cur = s; return cur; };
function transitionAt(t) {
  if (SOLO) return null;
  for (let j = 1; j < SCENES.length; j++) {
    const b = SCENES[j], d = b.in?.dur || 0;
    if (d > 0 && t >= b.t0 - d / 2 && t < b.t0 + d / 2) return { a: SCENES[j - 1], b, k: (t - (b.t0 - d / 2)) / d };
  }
  return null;
}

// ---------------- the probe ----------------
// While probing, scenes report what they draw. Coordinates go through the context's current transform, so a box
// marked inside a rig or under the camera lands in screen pixels. Use a layer's context (L.main…), not a scratch one.
let REC = null, RECORDING = false, WEIGHT = 1, ZN = 0;
const newRec = t => ({ t: +t.toFixed(5), scene: null, tempo: null, lt: null, seam: null, cam: null, marks: [], tracks: {}, plan: [], state: {} });
function toScreen(ctx, pts) {
  const m = ctx.getTransform(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f; x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
  return [x0, y0, x1, y1].map(v => Math.round(v * 10) / 10);
}
const zOf = ctx => (LAYER_Z.has(ctx) ? LAYER_Z.get(ctx) : -1) * 1e5 + (ZN++);
const mark = {
  // a character, prop or effect: kind 'char' | 'prop' | 'fx' | anything. Things drawn later cover text drawn earlier.
  box(ctx, id, kind, x, y, w, h, extra = {}) {
    if (!RECORDING) return;
    REC.marks.push({ id, kind, box: toScreen(ctx, [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]), z: zOf(ctx), alpha: +(ctx.globalAlpha * WEIGHT).toFixed(3), ...extra });
  },
  // text as drawn with ctx's current font and alignment. extra: { onset } (the moment it's sung or said: checks
  // fail text that shows early or completes late), { within } (seconds a deliberate slow reveal may take; 0.9 by
  // default), { read: true } (needs reading time), { shown } (0–1, how much of it is typed on).
  text(ctx, id, str, x, y, extra = {}) {
    if (!RECORDING) return;
    const m = ctx.measureText(str), t = ctx.getTransform(), sc = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c));
    REC.marks.push({ id, kind: 'text', text: str, box: toScreen(ctx, [[x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent], [x + m.actualBoundingBoxRight, y - m.actualBoundingBoxAscent],
      [x - m.actualBoundingBoxLeft, y + m.actualBoundingBoxDescent], [x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent]]),
      cap: +(ctx.measureText('H').actualBoundingBoxAscent * sc).toFixed(1), z: zOf(ctx), alpha: +(ctx.globalAlpha * WEIGHT).toFixed(3), ...extra });
  },
  fillText(ctx, id, str, x, y, extra) { ctx.fillText(str, x, y); mark.text(ctx, id, str, x, y, extra); },
  // a point to follow over time (a hip, a hand, the thing the shot is about): speeds, pops, spacing trails
  point(ctx, id, x, y) { if (!RECORDING) return; const b = toScreen(ctx, [[x, y]]); REC.tracks[id] = [b[0], b[1]]; },
  // intended oddities, so the checks don't flag them: 'black' 'flash' 'still' 'whip' 'smear' 'shake' 'cut' 'unreveal'
  plan(...flags) { if (!RECORDING) return; for (const f of flags) if (!REC.plan.includes(f)) REC.plan.push(f); },
  // anything a project rule needs (pen down? reveal.page = 0.4? camera width in mm?)
  state(key, value) { if (RECORDING) REC.state[key] = value; },
};

// ---------------- frames ----------------
const OUT = document.getElementById('out') || document.body.appendChild(mkCanvas());
OUT.width = W; OUT.height = H;
const OX = OUT.getContext('2d'), BUF_A = mkCanvas().getContext('2d'), BUF_B = mkCanvas().getContext('2d');
function paint(s, t, dst, own) {
  clearLayers(); cam(0, 0, 1); ZN = 0;
  RECORDING = !!REC && own;
  s.fn(t, t - s.t0, L);
  if (RECORDING) Object.assign(REC, { scene: s.name, tempo: s.tempo, lt: +(t - s.t0).toFixed(5), cam: { x: +CAM.x.toFixed(2), y: +CAM.y.toFixed(2), z: +CAM.z.toFixed(5), r: +CAM.r.toFixed(5) } });
  RECORDING = false;
  studio.composite(dst);
}
function renderFrame(t) {
  const tr = transitionAt(t);
  if (!tr) { WEIGHT = 1; paint(sceneAt(t), t, OX, true); return; }
  const T = tr.b.in.blend ? { blend: tr.b.in.blend, weights: tr.b.in.weights || (k => [1 - k, k]) } : TRANSITIONS[tr.b.in.kind || 'dissolve'];
  const [wa, wb] = T.weights(tr.k), ownA = wa >= wb;
  WEIGHT = wa; paint(tr.a, t, BUF_A, ownA);
  WEIGHT = wb; paint(tr.b, t, BUF_B, !ownA);
  WEIGHT = 1;
  T.blend(OX, BUF_A.canvas, BUF_B.canvas, tr.k);
  if (REC) { REC.seam = { from: tr.a.name, to: tr.b.name, k: +tr.k.toFixed(3) }; for (const f of T.plan ? T.plan(tr.k) : []) if (!REC.plan.includes(f)) REC.plan.push(f); }
}
function probeAt(t) { REC = newRec(t); try { renderFrame(t); return REC; } finally { REC = null; } }
function drawMarks(r) {   // the ?marks overlay: safe area, boxes, tracks, and the frame's facts
  const x = OX; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.lineWidth = 2; x.font = '600 20px system-ui, sans-serif'; x.textBaseline = 'bottom';
  x.setLineDash([12, 8]); x.strokeStyle = 'rgba(255,255,255,.5)'; x.strokeRect(W * SAFE, H * SAFE, W * (1 - 2 * SAFE), H * (1 - 2 * SAFE)); x.setLineDash([]);
  const col = { text: '#39f', char: '#f5a', prop: '#fb3', fx: '#aaa' };
  for (const m of r.marks) { const [a, b, c, d] = m.box; x.strokeStyle = x.fillStyle = col[m.kind] || '#6f6'; x.globalAlpha = .4 + .6 * m.alpha; x.strokeRect(a, b, c - a, d - b); x.fillText(m.id, a + 2, b - 2); }
  x.globalAlpha = 1;
  for (const [id, [px, py]] of Object.entries(r.tracks)) { x.fillStyle = '#f33'; x.beginPath(); x.arc(px, py, 7, 0, TAU); x.fill(); x.fillText(id, px + 9, py - 6); }
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, 0, W, 34); x.fillStyle = '#fff'; x.textBaseline = 'middle';
  x.fillText(`t ${r.t.toFixed(3)}  ·  ${r.scene} (${r.tempo}) +${r.lt?.toFixed(2)}  ·  cam ${r.cam?.x}, ${r.cam?.y} ×${r.cam?.z}${r.seam ? `  ·  seam ${r.seam.from}→${r.seam.to} ${r.seam.k}` : ''}${r.plan.length ? '  ·  plan: ' + r.plan.join(' ') : ''}`, 12, 17);
  x.restore();
}
function draw(t) { if (showMarks) drawMarks(probeAt(t)); else renderFrame(t); }

// ---------------- start ----------------
const ASSETS = [];
const studio = {
  composite: defaultComposite, transitions: TRANSITIONS,
  image(src) { const im = new Image(); ASSETS.push(new Promise((ok, bad) => { im.onload = ok; im.onerror = () => bad(new Error('image failed: ' + src)); })); im.src = src; return im; },
  async start() {
    SCENES.sort((a, b) => a.t0 - b.t0);
    SCENES.forEach((s, i) => { if (s.dur == null) s.dur = (SCENES[i + 1]?.t0 ?? DURATION ?? s.t0 + 5) - s.t0; });
    const end = DURATION ?? Math.max(...SCENES.map(s => s.t0 + s.dur));
    window.META = { W, H, FPS, SAFE, PREROLL, DURATION: end, layers: LAYER_NAMES,
      scenes: SCENES.map(s => ({ name: s.name, t0: s.t0, t1: s.t0 + s.dur, tempo: s.tempo, in: s.in ? { kind: s.in.blend ? 'custom' : (s.in.kind || 'dissolve'), dur: s.in.dur || 0 } : { kind: 'cut', dur: 0 } })) };
    Object.assign(window, { DURATION: end, PREROLL, SCENES: META.scenes,
      renderAt: t => { draw(t); return OUT.toDataURL('image/png'); }, probe: probeAt });
    await document.fonts.ready; await Promise.all(ASSETS);
    window.ready = true;
    if (Q.has('render')) return;
    ui(end);
  },
};

// ---------------- dev page: scrubber, scenes, play, marks ----------------
function ui(end) {
  const $ = id => document.getElementById(id), sb = $('scrub'), lab = $('time'), sel = $('scene'), mk = $('marks'), pb = $('play');
  if (RAW || !sb) { document.body.classList.add('raw'); draw(+(Q.get('t') || (Q.get('scene') && SCENES.find(s => s.name === Q.get('scene'))?.t0) || 0)); return; }
  let T = 0, playing = false, wall0 = 0, t0 = 0, audioOn = false;
  const audio = AUDIO ? new Audio(AUDIO) : null;
  sb.min = -PREROLL; sb.max = end; sb.step = 1 / FPS;
  for (const s of SCENES) sel.add(new Option(`${s.name}  ${s.t0.toFixed(2)}–${(s.t0 + s.dur).toFixed(2)}`, s.name));
  const go = t => {
    T = clamp(t, -PREROLL, end); const a = performance.now(); draw(T);
    lab.textContent = `${T.toFixed(3)} s · frame ${Math.round((T + PREROLL) * FPS)} · ${sceneAt(T).name} · ${Math.round(performance.now() - a)} ms`;
    sb.value = T; sel.value = sceneAt(T).name;
    const u = new URL(location); u.searchParams.set('t', T.toFixed(3)); history.replaceState(null, '', u);
  };
  const stop = () => { playing = false; pb.textContent = '▶'; if (audio) audio.pause(); };
  const tick = () => {
    if (!playing) return;
    let t = t0 + (performance.now() - wall0) / 1000;
    if (audio && t >= 0 && !audioOn) { audio.currentTime = t; audio.play(); audioOn = true; }
    if (audioOn && !audio.paused) t = audio.currentTime;
    if (t >= end) { go(end); stop(); return; }
    go(t); requestAnimationFrame(tick);
  };
  const play = () => { if (playing) return stop(); playing = true; audioOn = false; pb.textContent = '❚❚'; t0 = T >= end ? -PREROLL : T; wall0 = performance.now(); requestAnimationFrame(tick); };
  sb.addEventListener('input', () => { stop(); go(+sb.value); });
  sel.addEventListener('change', () => { stop(); go(SCENES.find(s => s.name === sel.value).t0); });
  mk.checked = showMarks; mk.addEventListener('change', () => { showMarks = mk.checked; go(T); });
  pb.addEventListener('click', play);
  addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    if (e.key === ' ') { e.preventDefault(); play(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stop(); go(T + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 1 / FPS)); }
    else if (e.key === 'Home') go(-PREROLL);
  });
  go(Q.has('t') ? +Q.get('t') : Q.get('scene') ? SCENES.find(s => s.name === Q.get('scene'))?.t0 ?? 0 : 0);
}
