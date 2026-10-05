// checks.mjs: run rules over probe data and the project's approval gates, so problems become a list, not a hunch.
//
//   node tools/checks.mjs [--probe=out/probe.json] [--rules=rules.mjs] [--shots=shots.json] [--only=rule,rule] [--json]
//   node tools/checks.mjs --approve=ID [--shots=shots.json]    record an approval: ONLY after the person said yes in chat
//
// Make the probe first: node tools/render.mjs --page=index.html --probe. Built-in rules:
//   text-early    error  text visible more than 1.5 frames before its onset
//   text-late     error  text not fully shown 0.9 s after its onset (or its own { within }), or never shown
//   text-safe     error  text outside the title-safe area
//   text-covered  error  text overlapped by something drawn over it
//   text-overlap  warn   two texts overlapping
//   text-small    warn   cap height under 4 % of the frame height (44 px at 1080p)
//   text-read     warn   text marked { read: true } on screen for less than 1.5 s + 1 s per 15 characters
//   pop           error  a tracked point jumps in a single frame (unless planned 'cut' / 'whip')
//   reveal        error  a 'reveal.*' state going backwards: something un-drawing (unless planned 'unreveal')
//   camera-speed  warn   sustained camera movement (0.5 s window) faster than the scene's tempo allows
//   motion-speed  warn   a tracked point's sustained speed above the tempo's limit (unless planned 'smear' / 'fast')
//   shot-length   warn   a scene shorter than its tempo's minimum
//   gate          error  shots.json: work that uses something not approved; approved files changed since approval
// Project rules live in rules.mjs (one per note from the person). Pace limits can be overridden there.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const shotsPath = args.shots || (existsSync('shots.json') ? 'shots.json' : null);
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex');

// ---------------- recording an approval ----------------
if (args.approve) {
  if (!shotsPath) { console.error('no shots.json'); process.exit(1); }
  const S = JSON.parse(readFileSync(shotsPath, 'utf8')), it = S.items.find(i => i.id === args.approve);
  if (!it) { console.error(`no item "${args.approve}" in ${shotsPath}`); process.exit(1); }
  const base = dirname(resolve(shotsPath)), files = [it.file, ...(it.files || [])].filter(Boolean);
  for (const f of files) if (!existsSync(resolve(base, f))) { console.error(`missing file ${f}: approve the exact file the person saw`); process.exit(1); }
  Object.assign(it, { status: 'approved', approved: new Date().toISOString().slice(0, 10) });
  if (it.file) it.sha256 = sha(resolve(base, it.file));
  if (it.files) it.sha256s = Object.fromEntries(it.files.map(f => [f, sha(resolve(base, f))]));
  writeFileSync(shotsPath, JSON.stringify(S, null, 2) + '\n');
  console.log(`${it.id} approved ${it.approved}${it.sha256 ? `, ${it.file} frozen at ${it.sha256.slice(0, 12)}…` : ''}. Log the person's exact words in REVIEW.md.`);
  process.exit(0);
}

// ---------------- limits ----------------
// Speeds in frame widths per second, sustained over 0.5 s; zoom as a fraction of scale per second; shots in seconds.
// Starting points, not laws (references/checks-and-pace.md): override per project in rules.mjs.
const TEMPO = {
  still: { cam: .02, zoom: .01, move: .05, minShot: 2 },
  tender: { cam: .08, zoom: .03, move: .25, minShot: 4 },
  normal: { cam: .15, zoom: .08, move: .8, minShot: 2 },
  action: { cam: .6, zoom: .3, move: 2.5, minShot: .75 },
};

const problems = [];   // { rule, level, t0, t1, key, msg, peak }
const add = (rule, level, t, key, msg, peak = 0) => problems.push({ rule, level, t0: t, t1: t, key, msg, peak });
let P = null, info = null;
const rulesPath = args.rules || (existsSync('rules.mjs') ? 'rules.mjs' : null);
const R = rulesPath ? await import(pathToFileURL(resolve(rulesPath)).href) : {};
for (const [k, v] of Object.entries(R.tempo || {})) TEMPO[k] = { ...(TEMPO[k] || TEMPO.normal), ...v };
const only = args.only ? String(args.only).split(',') : null, want = r => !only || only.includes(r);

const probePath = args.probe || (existsSync('out/probe.json') ? 'out/probe.json' : null);
if (probePath) {
  P = JSON.parse(readFileSync(probePath, 'utf8'));
  const m = P.meta || {}, W = m.W || 1920, H = m.H || 1080, SAFE = m.SAFE ?? .05, fps = P.fps / (P.every || 1), fr = P.frames;
  info = { W, H, SAFE, fps, FPS: P.fps, scenes: m.scenes || [], tempo: TEMPO };
  const tempoOf = f => TEMPO[f.tempo] || TEMPO.normal, hasPlan = (f, ...fl) => (f.plan || []).some(p => fl.includes(p));
  const inter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const areaOf = b => Math.max(1e-9, (b[2] - b[0]) * (b[3] - b[1]));
  const same = (a, b) => a && b && a.scene === b.scene && !a.seam && !b.seam && !hasPlan(b, 'cut');

  // text: onset, completeness, placement, cover, size, reading time
  const texts = new Map();
  fr.forEach(f => f.marks.filter(k => k.kind === 'text').forEach(k => { if (!texts.has(k.id)) texts.set(k.id, []); texts.get(k.id).push({ f, k }); }));
  for (const [id, seen] of texts) {
    const k0 = seen[0].k, label = `"${k0.text ?? id}"`;
    if (k0.onset != null) {
      const first = seen.find(s => s.k.alpha > .05);
      if (want('text-early') && first && first.f.t < k0.onset - 1.5 / P.fps) add('text-early', 'error', first.f.t, id, `${label} visible ${(k0.onset - first.f.t).toFixed(3)} s before its onset (${k0.onset})`);
      const full = seen.find(s => s.k.alpha >= .95 && (s.k.shown ?? 1) >= .99);
      const within = k0.within ?? .9;
      if (want('text-late') && (!full || full.f.t > k0.onset + within)) add('text-late', 'error', full ? full.f.t : k0.onset, id, full ? `${label} only fully shown ${(full.f.t - k0.onset).toFixed(2)} s after its onset (limit ${within} s; a deliberate slow reveal can declare { within })` : `${label} is never fully shown`);
    }
    if (want('text-small') && k0.cap && k0.cap < .04 * H) add('text-small', 'warn', seen[0].f.t, id, `${label} cap height ${k0.cap} px (want ≥ ${Math.round(.04 * H)})`);
    if (want('text-read') && seen.some(s => s.k.read)) {
      const dur = seen.filter(s => s.k.alpha > .5).length / fps, need = 1.5 + String(k0.text || '').length / 15;
      if (dur < need) add('text-read', 'warn', seen[0].f.t, id, `${label} readable for ${dur.toFixed(1)} s; needs about ${need.toFixed(1)} s`);
    }
  }
  const safe = [W * SAFE, H * SAFE, W * (1 - SAFE), H * (1 - SAFE)];
  for (const f of fr) {
    const ts = f.marks.filter(k => k.kind === 'text' && k.alpha > .5);
    for (const k of ts) {
      if (want('text-safe') && (k.box[0] < safe[0] - .5 || k.box[1] < safe[1] - .5 || k.box[2] > safe[2] + .5 || k.box[3] > safe[3] + .5)) add('text-safe', 'error', f.t, k.id, `"${k.text}" outside the title-safe area`);
      if (want('text-covered')) for (const o of f.marks) if (o.kind !== 'text' && o.z > k.z && o.alpha > .5 && inter(k.box, o.box) > .05 * areaOf(k.box)) add('text-covered', 'error', f.t, k.id + '/' + o.id, `"${k.text}" covered by ${o.id} (${o.kind})`);
      if (want('text-overlap')) for (const o of ts) if (o !== k && o.id > k.id && inter(k.box, o.box) > .05 * Math.min(areaOf(k.box), areaOf(o.box))) add('text-overlap', 'warn', f.t, k.id + '/' + o.id, `"${k.text}" overlaps "${o.text}"`);
    }
  }

  // tracked points: single-frame pops, and sustained speed against the tempo
  const ids = [...new Set(fr.flatMap(f => Object.keys(f.tracks)))], half = Math.max(1, Math.round(.25 * fps));
  for (const id of ids) {
    const d = fr.map((f, i) => i && same(fr[i - 1], f) && f.tracks[id] && fr[i - 1].tracks[id] ? Math.hypot(f.tracks[id][0] - fr[i - 1].tracks[id][0], f.tracks[id][1] - fr[i - 1].tracks[id][1]) : null);
    for (let i = 1; i < fr.length; i++) {
      if (d[i] == null || !want('pop') || hasPlan(fr[i], 'cut', 'whip')) continue;
      const nb = []; for (let j = i - 6; j <= i + 6; j++) if (j !== i && d[j] > .5) nb.push(d[j]); nb.sort((a, b) => a - b);
      const typical = nb.length ? nb[nb.length >> 1] : 0;
      if (d[i] > Math.max(40, 6 * typical)) add('pop', 'error', fr[i].t, id, `${id} jumps ${d[i].toFixed(0)} px in one frame (typical ${typical.toFixed(0)} px)`, d[i]);
    }
    if (!want('motion-speed')) continue;
    for (let i = half; i < fr.length - half; i++) {
      const a = fr[i - half], b = fr[i + half], f = fr[i];
      if (!a.tracks[id] || !b.tracks[id] || a.scene !== b.scene || a.seam || b.seam || hasPlan(f, 'smear', 'fast', 'cut', 'whip')) continue;
      let ok = true; for (let j = i - half + 1; j <= i + half; j++) if (!same(fr[j - 1], fr[j])) ok = false; if (!ok) continue;
      const v = Math.hypot(b.tracks[id][0] - a.tracks[id][0], b.tracks[id][1] - a.tracks[id][1]) / ((b.t - a.t) * W);
      if (v > tempoOf(f).move) add('motion-speed', 'warn', f.t, id, `${id} moves ${v.toFixed(2)} frame widths/s, over ${f.tempo}'s ${tempoOf(f).move}`, v);
    }
  }
  // camera: sustained pan and zoom speed (shake and handheld cancel out over the window)
  const pace = new Map(info.scenes.map(s => [s.name, { cam: 0, zoom: 0, move: 0 }]));
  for (let i = half; i < fr.length - half; i++) {
    const a = fr[i - half], b = fr[i + half], f = fr[i];
    if (!a.cam || !b.cam || a.scene !== b.scene || a.seam || b.seam) continue;
    const dt = b.t - a.t, v = Math.hypot(b.cam.x - a.cam.x, b.cam.y - a.cam.y) * f.cam.z / (dt * W), z = Math.abs(Math.log(b.cam.z / a.cam.z)) / dt, p = pace.get(f.scene);
    if (p) { p.cam = Math.max(p.cam, v); p.zoom = Math.max(p.zoom, z); }
    if (!hasPlan(f, 'smear', 'fast')) for (const id of ids) if (a.tracks[id] && b.tracks[id] && p) p.move = Math.max(p.move, Math.hypot(b.tracks[id][0] - a.tracks[id][0], b.tracks[id][1] - a.tracks[id][1]) / (dt * W));
    if (!want('camera-speed') || hasPlan(f, 'whip', 'cut')) continue;
    if (v > tempoOf(f).cam) add('camera-speed', 'warn', f.t, 'pan', `camera pans ${v.toFixed(3)} frame widths/s, over ${f.tempo}'s ${tempoOf(f).cam} (about ${(1 / v).toFixed(1)} s to cross the frame)`, v);
    if (z > tempoOf(f).zoom) add('camera-speed', 'warn', f.t, 'zoom', `camera zooms ${(z * 100).toFixed(1)} %/s, over ${f.tempo}'s ${(tempoOf(f).zoom * 100).toFixed(0)} %/s`, z);
  }
  // things drawn must stay drawn
  if (want('reveal')) for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i]; if (!same(a, b) || hasPlan(b, 'unreveal')) continue;
    for (const [k, v] of Object.entries(b.state || {})) if (k.startsWith('reveal.') && typeof v === 'number' && typeof a.state?.[k] === 'number' && v < a.state[k] - 1e-6) add('reveal', 'error', b.t, k, `${k} goes backwards (${a.state[k]} → ${v}): something un-draws`);
  }
  if (want('shot-length')) for (const s of info.scenes) { const T = TEMPO[s.tempo] || TEMPO.normal; if (s.t1 - s.t0 < T.minShot) add('shot-length', 'warn', s.t0, s.name, `scene ${s.name} lasts ${(s.t1 - s.t0).toFixed(2)} s; ${s.tempo} scenes want ≥ ${T.minShot} s`); }

  // project rules
  for (const rule of R.default || []) {
    if (!want(rule.name)) continue;
    const lvl = rule.level || 'error', norm = r => r == null ? [] : Array.isArray(r) ? r : [r];
    if (rule.frame) fr.forEach((f, i) => { for (const r of norm(rule.frame(f, info, fr[i - 1]))) add(rule.name, lvl, f.t, typeof r === 'string' ? r : r.key ?? r.msg, typeof r === 'string' ? r : r.msg); });
    if (rule.all) for (const r of norm(rule.all(fr, info))) problems.push({ rule: rule.name, level: r.level || lvl, t0: r.t, t1: r.t1 ?? r.t, key: r.key ?? r.msg, msg: r.msg, peak: 0 });
  }
  info.pace = pace;
} else if (!shotsPath) { console.error('nothing to check: make out/probe.json (render.mjs --probe) or pass --shots'); process.exit(1); }

// ---------------- approval gates ----------------
if (shotsPath && want('gate')) {
  const S = JSON.parse(readFileSync(shotsPath, 'utf8')), base = dirname(resolve(shotsPath)), by = new Map(S.items.map(i => [i.id, i]));
  for (const it of S.items) {
    if (['rejected', 'superseded', 'idea'].includes(it.status)) continue;
    for (const u of it.uses || []) { const d = by.get(u); if (!d) add('gate', 'error', null, it.id + u, `${it.id} uses ${u}, which isn't in shots.json`); else if (d.status !== 'approved') add('gate', 'error', null, it.id + u, `${it.id} (${it.status}) builds on ${u}, which is ${d.status}, not approved`); }
    if (it.status !== 'approved') continue;
    const check = (f, h) => { const p = resolve(base, f); if (!existsSync(p)) add('gate', 'error', null, it.id + f, `${it.id} is approved but ${f} is missing`); else if (!h) add('gate', 'warn', null, it.id + f, `${it.id} is approved with no hash for ${f}: run --approve=${it.id}`); else if (sha(p) !== h) add('gate', 'error', null, it.id + f, `${f} changed since ${it.id} was approved (${it.approved || '?'}): restore it, or show the new one and re-approve`); };
    if (it.file) check(it.file, it.sha256);
    for (const f of it.files || []) check(f, it.sha256s?.[f]);
  }
}

// ---------------- merge frames into runs, and report ----------------
const gap = info ? 1.5 / info.fps : 0;
problems.sort((a, b) => (a.rule + a.key).localeCompare(b.rule + b.key) || (a.t0 ?? -1) - (b.t0 ?? -1));
const runs = [];
for (const p of problems) { const r = runs[runs.length - 1]; if (r && r.rule === p.rule && r.key === p.key && p.t0 != null && r.t1 != null && p.t0 - r.t1 <= gap + 1e-9) { r.t1 = p.t1; if (p.peak > r.peak) { r.peak = p.peak; r.msg = p.msg; } } else runs.push({ ...p }); }
runs.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1) || (a.t0 ?? -1) - (b.t0 ?? -1));
if (args.json) { console.log(JSON.stringify(runs, null, 1)); process.exit(runs.some(r => r.level === 'error') ? 1 : 0); }
const pre = P?.preroll || 0, when = r => r.t0 == null ? ''.padEnd(16) : `t ${r.t0.toFixed(2)}${r.t1 > r.t0 ? '–' + r.t1.toFixed(2) : ''}${pre ? ` (video ${(r.t0 + pre).toFixed(2)})` : ''}`.padEnd(16);
for (const r of runs) console.log(`${r.level.toUpperCase().padEnd(5)}  ${r.rule.padEnd(13)} ${when(r)}  ${r.msg}`);
if (info?.pace?.size) {
  console.log('\npace (sustained maxima; limits in brackets)          scene length');
  for (const s of info.scenes) { const p = info.pace.get(s.name) || {}, T = TEMPO[s.tempo] || TEMPO.normal;
    console.log(`  ${s.name.padEnd(16)} ${String(s.tempo).padEnd(7)} camera ${(p.cam || 0).toFixed(3)} [${T.cam}]  zoom ${((p.zoom || 0) * 100).toFixed(1)}% [${T.zoom * 100}%]  motion ${(p.move || 0).toFixed(2)} [${T.move}]   ${(s.t1 - s.t0).toFixed(2)} s [≥ ${T.minShot}]`); }
}
const nE = runs.filter(r => r.level === 'error').length, nW = runs.length - nE;
console.log(`\n${nE} error(s), ${nW} warning(s)${probePath ? ` from ${probePath}` : ''}${shotsPath ? ` and ${shotsPath}` : ''}${R.default ? `, with ${R.default.length} project rule(s)` : ''}`);
process.exit(nE ? 1 : 0);
