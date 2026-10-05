// metrics.mjs: measure an encoded video frame by frame, so problems that stills and contact sheets hide show up as
// numbers. No dependencies beyond ffmpeg/ffprobe.
//
//   node tools/metrics.mjs --video=out/video.mp4 [--probe=out/probe.json] [--start=T] [--graph=out/metrics.png]
//        [--out=out/metrics.json] [--size=160x90] [--black=16] [--freeze=1]
//
// Finds, per frame of the decoded file:
//   black / flat    a frame that is (nearly) one colour: black, or grey, often a missing or half-drawn frame
//   flash           a frame much brighter than its neighbourhood
//   glitch          a frame unlike both neighbours while they match each other: a ghost, a double image, a stray frame
//                   at a hand-off, a one-frame pop
//   cut             a hard change of picture; compared with the scene list when --probe is given
//   freeze          no pixel changes for longer than --freeze seconds: a dead hold (twos are fine)
//   bitrate         per second, to catch grain or jitter that changes every pixel every frame
// With --probe, anything the scenes declared with mark.plan('black' | 'flash' | 'still' | 'cut' …) is expected and not
// an error. --start is the timeline time of the video's first frame (default: minus the pre-roll).
// Prints per-second sparklines (motion, bitrate, events) and exits 1 on unplanned black, flat, flash or glitch frames.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (!args.video) { console.log('usage: see the header of metrics.mjs'); process.exit(1); }
const [SW, SH] = String(args.size || '160x90').split('x').map(Number), N = SW * SH;
const BLACK = +(args.black ?? 16), FREEZE = +(args.freeze ?? 1);

// ---------------- read the file ----------------
const pr = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,nb_frames,width,height', '-show_entries', 'format=duration', '-of', 'json', args.video], { encoding: 'utf8' }).stdout || '{}');
if (!pr.streams?.length) { console.error(`can't read ${args.video}`); process.exit(1); }
const [fn, fd] = pr.streams[0].r_frame_rate.split('/').map(Number), fps = fn / (fd || 1);
const probe = args.probe ? JSON.parse(readFileSync(args.probe, 'utf8')) : null;
const pre = probe?.preroll ?? 0, start = args.start != null ? +args.start : -pre;
const tOf = i => start + i / fps;

const mean = [], sd = [], d1 = [], d2 = [], mx1 = [];
await new Promise((ok, bad) => {
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', args.video, '-vf', `scale=${SW}:${SH}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let buf = Buffer.alloc(0), p1 = null, p2 = null;
  ff.stdout.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= N) {
      const f = Buffer.from(buf.subarray(0, N)); buf = buf.subarray(N);
      let s = 0, s2 = 0; for (let i = 0; i < N; i++) { s += f[i]; s2 += f[i] * f[i]; }
      const m = s / N; mean.push(m); sd.push(Math.sqrt(Math.max(0, s2 / N - m * m)));
      let a = 0, mx = 0, b = 0;
      if (p1) for (let i = 0; i < N; i++) { const d = Math.abs(f[i] - p1[i]); a += d; if (d > mx) mx = d; }
      if (p2) for (let i = 0; i < N; i++) b += Math.abs(f[i] - p2[i]);
      d1.push(p1 ? a / N : 0); mx1.push(p1 ? mx : 255); d2.push(p2 ? b / N : 0);
      p2 = p1; p1 = f;
    }
  });
  ff.on('close', c => c ? bad(new Error('ffmpeg exited ' + c)) : ok());
});
const F = mean.length;
// bitrate per second from packet sizes
const kbps = [];
for (const line of spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,size', '-of', 'csv=p=0', args.video], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.trim().split('\n')) {
  const [pt, sz] = line.split(',').map(Number); if (!Number.isFinite(pt)) continue; const s = Math.floor(pt); kbps[s] = (kbps[s] || 0) + sz * 8 / 1000;
}
for (let i = 0; i < kbps.length; i++) kbps[i] ||= 0;

// ---------------- what the scenes planned ----------------
const planAt = new Map();   // video frame → plan flags
if (probe) for (const r of probe.frames) { const i = Math.round((r.t - start) * fps); for (let k = 0; k < (probe.every || 1); k++) planAt.set(i + k, r.plan || []); }
const planned = (i, ...flags) => { for (let k = i - 1; k <= i + 1; k++) if ((planAt.get(k) || []).some(f => flags.includes(f))) return true; return false; };
const expectedCuts = new Set();
if (probe) {
  for (const s of (probe.meta?.scenes || []).slice(1)) if (!probe.solo && (s.in?.kind === 'cut' || !s.in?.dur)) expectedCuts.add(Math.round((s.t0 - start) * fps));
  for (const [i, fl] of planAt) if (fl.includes('cut')) expectedCuts.add(i);
}

// ---------------- find events ----------------
const med = (arr, a, b, skip = -1) => { const v = []; for (let i = Math.max(0, a); i <= Math.min(arr.length - 1, b); i++) if (i !== skip) v.push(arr[i]); v.sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; };
const ev = [];   // { kind, i0, i1, level, planned, detail }
const runs = (pred, kind, level, flags, detail) => { let i0 = -1; for (let i = 0; i <= F; i++) { const on = i < F && pred(i); if (on && i0 < 0) i0 = i; if (!on && i0 >= 0) { const pl = flags.length && [...Array(i - i0).keys()].every(k => planned(i0 + k, ...flags)); ev.push({ kind, i0, i1: i - 1, level: pl ? 'planned' : level, detail: detail(i0, i - 1) }); i0 = -1; } } };
runs(i => sd[i] < 4 && mean[i] < BLACK, 'black', 'error', ['black'], (a, b) => `${b - a + 1} frame(s) of black`);
runs(i => sd[i] < 2.5 && mean[i] >= BLACK, 'flat', 'error', ['black', 'flash', 'flat'], (a, b) => `${b - a + 1} flat frame(s) at grey level ${mean[a].toFixed(0)}: missing or half-drawn?`);
runs(i => mean[i] - med(mean, i - 8, i + 8) > 35, 'flash', 'error', ['flash'], (a, b) => `${b - a + 1} frame(s) ${(mean[a] - med(mean, a - 8, b + 8)).toFixed(0)} levels brighter than around them`);
const glitch = new Set();
for (let i = 1; i < F - 1; i++) {
  const T = Math.max(3, 4 * med(d1, i - 12, i + 12));
  if (d1[i] > T && d1[i + 1] > T && d2[i + 1] < .35 * Math.min(d1[i], d1[i + 1])) {
    glitch.add(i);
    ev.push({ kind: 'glitch', i0: i, i1: i, level: planned(i, 'flash', 'glitch') ? 'planned' : 'error', detail: `frame unlike both neighbours (Δ ${d1[i].toFixed(1)} / ${d1[i + 1].toFixed(1)}, neighbours Δ ${d2[i + 1].toFixed(1)}): a ghost, double image or stray frame?` });
  }
}
const cuts = [], flashy = i => i >= 0 && i < F && mean[i] - med(mean, i - 8, i + 8) > 35;
for (let i = 1; i < F; i++) {
  const around = Math.max(med(d1, i - 12, i - 1), med(d1, i + 1, i + 12));
  if (d1[i] > Math.max(20, 6 * around) && !glitch.has(i) && !glitch.has(i - 1) && !flashy(i) && !flashy(i - 1)) {
    cuts.push(i);
    const exp = [...expectedCuts].some(c => Math.abs(c - i) <= 1);
    ev.push({ kind: 'cut', i0: i, i1: i, level: !probe ? 'info' : exp || planned(i, 'cut', 'flash', 'shake', 'whip') ? 'info' : 'warn', detail: probe && !exp ? 'a hard cut where no scene starts: a jump or a pop?' : 'cut' });
  }
}
runs(i => mx1[i] <= 2, 'freeze', 'warn', ['still', 'black'], (a, b) => `${((b - a + 1) / fps).toFixed(2)} s with no pixel changing: a dead hold?`);
for (let k = ev.length - 1; k >= 0; k--) if (ev[k].kind === 'freeze' && (ev[k].i1 - ev[k].i0 + 1) / fps < FREEZE) ev.splice(k, 1);
ev.sort((a, b) => a.i0 - b.i0);

// ---------------- report ----------------
const fmt = t => { const s = Math.abs(t), m = Math.floor(s / 60); return (t < 0 ? '-' : '') + `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const secs = Math.ceil(F / fps), motion = Array.from({ length: secs }, (_, s) => { let a = 0, n = 0; for (let i = Math.round(s * fps); i < Math.min(F, Math.round((s + 1) * fps)); i++) { a += d1[i]; n++; } return n ? a / n : 0; });
const bars = '▁▂▃▄▅▆▇█', spark = (v, mx) => v.map(x => bars[Math.min(7, Math.floor(Math.sqrt(x / (mx || 1)) * 7.99))]).join('');
const mMax = Math.max(...motion, 1e-9), kMax = Math.max(...kbps, 1e-9);
const marks = Array.from({ length: secs }, (_, s) => { const e = ev.filter(e => Math.floor(e.i0 / fps) === s); return e.some(e => e.level === 'error') ? '!' : e.some(e => e.level === 'warn') ? '?' : e.some(e => e.kind === 'cut') ? '|' : e.length ? '·' : ' '; }).join('');
console.log(`${args.video}: ${F} frames at ${+fps.toFixed(3)} fps (${(F / fps).toFixed(2)} s); frame 0 = t ${start}`);
console.log(`per second (motion and bitrate on a square-root scale; events: ! error  ? warning  | cut  · planned)`);
for (let s = 0; s < secs; s += 60) {
  const e = Math.min(secs, s + 60);
  console.log(`  ${fmt(tOf(Math.round(s * fps))).padStart(8)}  motion  ${spark(motion.slice(s, e), mMax)}`);
  console.log(`  ${''.padStart(8)}  kbps    ${spark(kbps.slice(s, e), kMax)}`);
  console.log(`  ${''.padStart(8)}  events  ${marks.slice(s, e)}`);
}
const avg = kbps.reduce((a, b) => a + b, 0) / (kbps.length || 1);
console.log(`bitrate: mean ${(avg / 1000).toFixed(1)} Mbps, peak ${(kMax / 1000).toFixed(1)} Mbps in second ${kbps.indexOf(kMax)}`);
if (cuts.length) { const shots = [0, ...cuts, F].slice(1).map((c, k) => (c - [0, ...cuts][k]) / fps); console.log(`hard cuts: ${cuts.length}; shots between them average ${(shots.reduce((a, b) => a + b, 0) / shots.length).toFixed(1)} s (shortest ${Math.min(...shots).toFixed(1)} s)`); }
const shown = ev.filter(e => e.kind !== 'cut' || e.level !== 'info');
for (const e of shown) console.log(`${e.level.toUpperCase().padEnd(7)} ${e.kind.padEnd(6)} t ${fmt(tOf(e.i0))}${e.i1 > e.i0 ? '–' + fmt(tOf(e.i1)) : ''}  (video ${(e.i0 / fps).toFixed(3)} s, frame ${e.i0})  ${e.detail}`);
const errors = ev.filter(e => e.level === 'error').length, warns = ev.filter(e => e.level === 'warn').length;
console.log(`${errors} error(s), ${warns} warning(s)${!probe ? ' (no --probe: planned blacks and flashes count as errors)' : ''}`);

if (args.out) { mkdirSync(dirname(args.out), { recursive: true }); writeFileSync(args.out, JSON.stringify({ video: args.video, fps, frames: F, start, kbps, events: ev.map(e => ({ ...e, t0: tOf(e.i0), t1: tOf(e.i1) })), perFrame: mean.map((m, i) => ({ t: +tOf(i).toFixed(4), mean: +m.toFixed(2), sd: +sd[i].toFixed(2), d1: +d1[i].toFixed(3) })) })); console.log(args.out); }
if (args.graph) { writeFileSync(args.graph, graph()); console.log(args.graph); }
process.exit(errors ? 1 : 0);

// ---------------- the graph: luma, motion and bitrate on one timeline ----------------
function graph() {
  const Wd = Math.max(900, Math.min(2400, Math.round(F / fps * 24))), lane = 80, Ht = 3 * lane + 44, img = Buffer.alloc(Wd * Ht * 3);
  const px = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= Wd || y >= Ht) return; const o = (y * Wd + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  const X = i => 40 + (i / Math.max(1, F - 1)) * (Wd - 50);
  rect(0, 0, Wd, Ht, [17, 17, 20]);
  for (let k = 0; k < 3; k++) rect(40, 8 + k * lane, Wd - 50, lane - 8, [28, 28, 34]);
  for (const e of ev) { const c = e.level === 'error' ? [230, 60, 60] : e.level === 'warn' ? [230, 170, 50] : e.kind === 'cut' ? [90, 90, 100] : [60, 170, 90]; rect(X(e.i0), 8, Math.max(2, X(e.i1) - X(e.i0)), 3 * lane - 8, c.map(v => v * .55)); }
  const plot = (k, v, top, col) => { let p = null; for (let i = 0; i < F; i++) { const q = [X(i), 8 + k * lane + (lane - 10) * (1 - Math.min(1, v(i) / top))];
    if (p) { const n = Math.ceil(Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]))) + 1; for (let s = 0; s <= n; s++) px(p[0] + (q[0] - p[0]) * s / n, p[1] + (q[1] - p[1]) * s / n, col); } p = q; } };
  plot(0, i => mean[i], 255, [235, 235, 235]);
  plot(1, i => Math.sqrt(d1[i]), Math.sqrt(Math.max(...d1, 1)), [80, 210, 255]);
  for (let s = 0; s < kbps.length; s++) { const h = (lane - 10) * Math.sqrt(kbps[s] / kMax); rect(X(s * fps), 2 * lane + 8 + (lane - 10) - h, Math.max(1, X((s + 1) * fps) - X(s * fps) - 1), h, [240, 200, 70]); }
  // time axis: a tick every second, labelled every 5 or 10
  const every = F / fps > 60 ? 10 : 5;
  for (let s = 0; s <= F / fps; s++) { const x = X(s * fps); rect(x, 3 * lane + 4, 1, s % every ? 4 : 9, [150, 150, 160]); if (s % every === 0) text(x - 6, 3 * lane + 18, fmt(tOf(Math.round(s * fps))).replace(/\.\d+$/, ''), [200, 200, 210]); }
  text(2, 12, 'LUMA', [200, 200, 210]); text(2, 12 + lane, 'MOTN', [80, 210, 255]); text(2, 12 + 2 * lane, 'KBPS', [240, 200, 70]);
  return png(Wd, Ht, img);
  function text(x, y, s, c) {
    const G = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', ':': '000010000010000', '-': '000000111000000',
      L: '100100100100111', U: '101101101101111', M: '101111111101101', A: '111101111101101', O: '111101101101111', T: '111010010010010', N: '110101101101101', K: '101101110101101', B: '110101110101110', P: '111101111100100', S: '011100010001110' };
    for (const ch of s) { const g = G[ch]; if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === '1') rect(x + q * 2, y + r * 2, 2, 2, c); x += 8; }
  }
}
function png(w, h, rgb) {
  const T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = b => { let c = -1; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
