// render.mjs: render a code-drawn animation page to stills, contact sheets, motion views, probe data or video.
//
// Page contract (assets/project/src/studio.js implements all of it):
//   window.ready === true     once fonts and assets are loaded
//   window.renderAt(t)        draws time t (seconds; negative in a pre-roll) and returns a PNG data URL (may be a Promise)
//   window.DURATION           length in seconds (or --duration);  window.PREROLL: silence before t = 0 (or --preroll)
//   window.probe(t)           optional: what's on screen at t (scene, camera, marks, tracks, plan, state), for --probe,
//                             --trails and tools/checks.mjs
//   window.SCENES, META       optional: [{ name, t0, t1, tempo }] for --scene, and the header of probe.json
//
// Needs puppeteer-core (npm i), ffmpeg on PATH, and Google Chrome. Node finds puppeteer-core from this script's folder
// upward, so keep the script inside the project (tools/). All times are timeline times t; video time = t + pre-roll.
//
// Looking at frames
//   --stills=1.5,59.3 [--out=out/stills]              PNGs. --compare=ref.png diffs the (first) still against an approved one
//   --sheet=0:240:3 | --sheet=1,2.5,7 | --sheet=all[:N]  a labelled contact sheet (all = the whole timeline in N tiles, 24)
//   --strip=a:b[:step]                                every drawing from a to b (step 1/12 s), labelled: motion as a grid
//   --onion=a:b[:step]                                frames a..b averaged into one image, the last on top: spacing, arcs
//   --trails=a:b [--screen]                           the frame at b with each tracked point's path dotted frame by frame
//                                                     (pinned to the world as seen at b; --screen for screen positions)
//   [--cols=6] [--w=320] [--out=out/x.png]
// Data
//   --probe [--out=out/probe.json] [--every=1]        window.probe(t) for every frame (or every N), for tools/checks.mjs
// Video
//   --video [--out=out/video.mp4] [--audio=song.wav] [--from=A --to=B] [--fps=24 --crf=18 --seg=20 --workers=6]
//       renders resumable segments into <out>.segs/, joins them with -c copy, muxes the audio (delayed by the pre-roll)
//       and prints a verification summary. Re-running resumes; --force re-renders every segment.
//   --prores[=4444]                                   ProRes 422 HQ .mov for an editor; =4444 adds alpha (the page gets ?alpha)
// Anywhere
//   --scene=name        limit --video, --probe and --sheet=all to one scene's span
//   --solo              draw only that scene (?solo=name), so frames past its ends continue it instead of its neighbours
//   --handles=N         extend the span N frames each side (implies --solo): shots for an editor
//   --query="k=v&flag"  --size=1920x1080  --preroll=S  --duration=S  --workers=N
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (!args.page) { console.log('usage: see the header of render.mjs'); process.exit(1); }
const die = m => { console.error(m); process.exit(1); };
const CHROME = args.chrome || process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const fps = +(args.fps || 24), [VW, VH] = String(args.size || '1920x1080').split('x').map(Number);
const pro = args.prores ? (String(args.prores) === '4444' ? '4444' : 'hq') : null;
const solo = args.scene && (args.solo || args.handles) ? args.scene : null;
const query = [args.query, pro === '4444' ? 'alpha' : '', solo ? 'solo=' + encodeURIComponent(solo) : ''].filter(s => s && s !== true).join('&');
const gpu = process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-gl=angle', '--use-angle=default'];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--allow-file-access-from-files', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', ...gpu, `--window-size=${VW},${VH}`, '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });

async function openPage(tag = '', tries = 3) {
  for (let i = 0; ; i++) {
    const page = await browser.newPage();
    page.on('console', m => { if (['error', 'warn'].includes(m.type())) console.log(`[page${tag}]`, m.text()); });
    page.on('pageerror', e => console.log(`[page error${tag}]`, e.message));
    try {
      await page.goto(pathToFileURL(resolve(args.page)).href + '?render' + (query ? '&' + query : ''), { waitUntil: 'load' });
      await page.waitForFunction('window.ready === true', { timeout: 120000 });
      return page;
    } catch (e) { await page.close(); if (i + 1 >= tries) throw e; console.log(`[page${tag}] retrying: ${e.message}`); }
  }
}
const pool = n => Promise.all(Array.from({ length: n }, (_, w) => openPage('#' + w)));
const frameOf = async (page, t) => { const url = await page.evaluate(t => window.renderAt(t), t); return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'); };
const run = (cmd, a) => new Promise((ok, bad) => { const p = spawn(cmd, a, { stdio: 'inherit' }); p.on('close', c => c ? bad(new Error(`${cmd} exited ${c}`)) : ok()); });
const list = s => String(s).split(',').map(Number);
const range = (a, b, s) => { const r = []; for (let t = a; t <= b + 1e-9; t += s) r.push(+t.toFixed(5)); return r; };
const ab = (spec, step) => { const [a, b, s] = String(spec).split(':').map(Number); if (!(b > a)) die(`need a:b with b > a, got ${spec}`); return range(a, b, s || step); };
// render times on a pool of pages, results in order
async function renderMany(ts, pages) { const out = new Array(ts.length); let next = 0; await Promise.all(pages.map(async p => { while (next < ts.length) { const i = next++; out[i] = await frameOf(p, ts[i]); } })); return out; }
// the timeline span, narrowed by --scene / --handles / --from / --to
async function span(page) {
  const i = await page.evaluate(() => ({ dur: window.DURATION, pre: window.PREROLL || 0, scenes: window.SCENES || null, meta: window.META || null }));
  const dur = +(args.duration ?? i.dur), pre = +(args.preroll ?? i.pre);
  if (!(dur > 0)) die('no duration: set window.DURATION or pass --duration');
  let from = -pre, to = dur;
  if (args.scene) {
    const s = i.scenes?.find(s => s.name === args.scene);
    if (!s) die(`no scene "${args.scene}"; the page has: ${(i.scenes || []).map(s => s.name).join(', ') || 'no window.SCENES'}`);
    from = s.t0; to = s.t1;
  }
  const h = +(args.handles || 0) / fps; from -= h; to += h;
  if (args.from != null) from = +args.from; if (args.to != null) to = +args.to;
  return { dur, pre, from, to, scenes: i.scenes, meta: i.meta };
}
// a labelled grid of frames
function tile(bufs, labels, out, cols, w) {
  const dir = join(tmpdir(), 'rsheet_' + process.pid + '_' + Date.now()); mkdirSync(dir, { recursive: true }); mkdirSync(dirname(out), { recursive: true });
  bufs.forEach((b, i) => writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), b));
  const rows = Math.ceil(bufs.length / cols), esc = s => s.replace(/[:'\\]/g, m => '\\' + m);
  const text = labels.map((l, i) => `drawtext=text='${esc(l)}':x=6:y=6:fontsize=${Math.round(w / 16)}:fontcolor=white:box=1:boxcolor=black@0.6:enable='eq(n\\,${i})'`).join(',');
  const go = vf => spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', join(dir, 'f%04d.png'), '-vf', vf, '-frames:v', '1', out], { stdio: 'inherit' }).status;
  if (go(`scale=${w}:-2,${text},tile=${cols}x${rows}`)) go(`scale=${w}:-2,tile=${cols}x${rows}`);   // no drawtext in this ffmpeg build
  rmSync(dir, { recursive: true, force: true });
}
const saveURL = (url, out) => { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); };
const LOAD = `const load = src => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('decode failed')); im.src = src; });`;

if (args.stills) {
  const page = await openPage(), out = args.out || 'out/stills'; mkdirSync(out, { recursive: true });
  const files = [];
  for (const t of list(args.stills)) { const f = join(out, `t${t.toFixed(2).replace('.', '_').replace('-', 'm')}.png`); writeFileSync(f, await frameOf(page, t)); files.push(f); console.log(f); }
  if (args.compare) {
    const ref = 'data:image/png;base64,' + readFileSync(args.compare).toString('base64'), cur = 'data:image/png;base64,' + readFileSync(files[0]).toString('base64');
    const r = await page.evaluate(new Function('refURL', 'curURL', `return (async () => { ${LOAD}
      const [A, B] = [await load(refURL), await load(curURL)]; if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height] };
      const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(A, 0, 0); const a = x.getImageData(0, 0, c.width, c.height); x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0); const b = x.getImageData(0, 0, c.width, c.height);
      const d = x.createImageData(c.width, c.height); let n = 0, max = 0;
      for (let i = 0; i < a.data.length; i += 4) { const m = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3]));
        if (m) { n++; max = Math.max(max, m); } const g = a.data[i] * .1; d.data[i] = m ? 255 : g; d.data[i + 1] = m ? Math.max(0, 180 - m * 4) : g; d.data[i + 2] = g; d.data[i + 3] = 255; }
      x.putImageData(d, 0, 0); return { n, max, total: a.data.length / 4, url: c.toDataURL('image/png') }; })()`), ref, cur);
    if (r.size) die(`size differs: approved ${r.size[0]}×${r.size[1]}, now ${r.size[2]}×${r.size[3]}`);
    if (!r.n) console.log(`identical to ${args.compare}`);
    else { const f = files[0].replace(/\.png$/, '.diff.png'); saveURL(r.url, f); console.log(`DIFFERS from ${args.compare}: ${r.n} of ${r.total} pixels (max Δ ${r.max}); changed pixels in red: ${f}`); process.exitCode = 1; }
  }
} else if (args.sheet || args.strip) {
  const pages = await pool(Math.min(+(args.workers || 4), 4)), sp = await span(pages[0]);
  let ts;
  if (args.strip) ts = ab(args.strip, 1 / 12);
  else if (String(args.sheet).startsWith('all')) { const n = +(String(args.sheet).split(':')[1] || 24); ts = Array.from({ length: n }, (_, i) => +(sp.from + (sp.to - sp.from) * (i + .5) / n).toFixed(3)); }
  else if (String(args.sheet).includes(':')) ts = ab(args.sheet, 1);
  else ts = list(args.sheet);
  const out = args.out || (args.strip ? 'out/strip.png' : 'out/sheet.png'), cols = +(args.cols || (args.strip ? 8 : 6)), w = +(args.w || (args.strip ? 240 : 320));
  tile(await renderMany(ts, pages), ts.map(t => args.strip ? `${t.toFixed(3)}s  f${Math.round((t + sp.pre) * fps)}` : `${t.toFixed(2)}s`), out, cols, w);
  console.log(`${out}  (${ts.length} frames)`);
} else if (args.onion) {
  const page = await openPage(), ts = ab(args.onion, 1 / 12), out = args.out || 'out/onion.png';
  const url = await page.evaluate(new Function('ts', `return (async () => { ${LOAD}
    let c, x; for (let i = 0; i < ts.length; i++) { const im = await load(await window.renderAt(ts[i]));
      if (!c) { c = document.createElement('canvas'); c.width = im.width; c.height = im.height; x = c.getContext('2d'); }
      x.globalAlpha = 1 / (i + 1); x.drawImage(im, 0, 0); }
    x.globalAlpha = .45; x.drawImage(await load(await window.renderAt(ts[ts.length - 1])), 0, 0); return c.toDataURL('image/png'); })()`), ts);
  saveURL(url, out); console.log(`${out}  (${ts.length} frames averaged, ${ts[0]}–${ts[ts.length - 1]} s; the last frame is strongest)`);
} else if (args.trails) {
  const page = await openPage(), ts = ab(args.trails, 1 / fps), out = args.out || 'out/trails.png';
  if (!(await page.evaluate(() => typeof window.probe === 'function'))) die('--trails needs window.probe (see studio.js) and mark.point() calls');
  const url = await page.evaluate(new Function('ts', 'screenSpace', 'W', 'H', `return (async () => { ${LOAD}
    const recs = ts.map(t => window.probe(t)), last = recs[recs.length - 1], im = await load(await window.renderAt(ts[ts.length - 1]));
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, c.width, c.height);
    // screen → world with that frame's camera, then world → screen with the last frame's camera
    const toWorld = (p, k) => { const s = Math.sin(-k.r), co = Math.cos(-k.r), dx = (p[0] - W / 2) / k.z, dy = (p[1] - H / 2) / k.z; return [k.x + co * dx - s * dy, k.y + s * dx + co * dy]; };
    const toScreen = (p, k) => { const s = Math.sin(k.r), co = Math.cos(k.r), dx = (p[0] - k.x) * k.z, dy = (p[1] - k.y) * k.z; return [W / 2 + co * dx - s * dy, H / 2 + s * dx + co * dy]; };
    const pos = (r, id) => { const p = r.tracks[id]; if (!p) return null; return screenSpace || !r.cam || !last.cam ? p : toScreen(toWorld(p, r.cam), last.cam); };
    const ids = [...new Set(recs.flatMap(r => Object.keys(r.tracks)))], pal = ['#ff4d4d', '#4dd2ff', '#ffd24d', '#7dff6a', '#d77dff', '#ff9a3d', '#ffffff'];
    x.font = '600 22px system-ui, sans-serif'; x.textBaseline = 'middle';
    ids.forEach((id, j) => { const col = pal[j % pal.length]; x.strokeStyle = x.fillStyle = col; x.lineWidth = 1.5;
      x.beginPath(); let started = false; recs.forEach(r => { const p = pos(r, id); if (!p) { started = false; return; } if (started) x.lineTo(...p); else { x.moveTo(...p); started = true; } }); x.globalAlpha = .5; x.stroke(); x.globalAlpha = 1;
      recs.forEach((r, i) => { const p = pos(r, id); if (!p) return; const big = i % 12 === 0; x.beginPath(); x.arc(p[0], p[1], big ? 6 : 3.5, 0, 7); x.fill(); if (big) { x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke(); x.strokeStyle = col; } });
      x.fillRect(16, 20 + j * 30 - 8, 16, 16); x.fillText(id, 40, 20 + j * 30); });
    x.fillStyle = '#fff'; x.fillText(\`\${ts[0].toFixed(2)}–\${ts[ts.length - 1].toFixed(2)} s · a dot per frame, ringed every 12 · \${screenSpace ? 'screen positions' : 'pinned to the world as seen in the last frame'}\`, 16, c.height - 24);
    return c.toDataURL('image/png'); })()`), ts, !!args.screen, VW, VH);
  saveURL(url, out); console.log(`${out}  (${ts.length} frames)`);
} else if (args.probe) {
  const pages = await pool(+(args.workers || 4)), sp = await span(pages[0]), every = +(args.every || 1), out = args.out || 'out/probe.json';
  if (!(await pages[0].evaluate(() => typeof window.probe === 'function'))) die('the page has no window.probe (see assets/project/src/studio.js)');
  const F0 = Math.round((sp.from + sp.pre) * fps), F1 = Math.round((sp.to + sp.pre) * fps), ts = [];
  for (let f = F0; f < F1; f += every) ts.push(+(f / fps - sp.pre).toFixed(6));
  const chunks = []; for (let i = 0; i < ts.length; i += 48) chunks.push(ts.slice(i, i + 48));
  const res = new Array(chunks.length); let next = 0; const start = Date.now();
  await Promise.all(pages.map(async p => { while (next < chunks.length) { const i = next++; res[i] = await p.evaluate(ts => ts.map(t => window.probe(t)), chunks[i]); } }));
  const frames = res.flat(), head = { meta: sp.meta, fps, preroll: sp.pre, from: sp.from, to: sp.to, every, scene: args.scene || null, solo: !!solo };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(head).slice(0, -1) + ',"frames":[\n' + frames.map(f => JSON.stringify(f)).join(',\n') + '\n]}\n');   // one frame per line: grep by time
  console.log(`${out}  (${frames.length} frames, ${((Date.now() - start) / frames.length).toFixed(0)} ms/frame)  next: node tools/checks.mjs --probe=${out}`);
} else if (args.video) {
  const pages = await pool(+(args.workers || 6)), sp = await span(pages[0]), { pre, from, to } = sp;
  const ext = pro ? '.mov' : '.mp4', out = args.out || 'out/video' + ext, segDir = args.dir || out + '.segs';
  const F0 = Math.round((from + pre) * fps), F1 = Math.round((to + pre) * fps), segN = Math.round(+(args.seg || 20) * fps);
  const tags = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  const enc = pro === '4444' ? ['-vf', 'format=yuva444p10le', '-c:v', 'prores_ks', '-profile:v', '4444', '-vendor', 'apl0', ...tags]
    : pro ? ['-vf', 'scale=out_range=tv,format=yuv422p10le', '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', ...tags]
    : ['-vf', 'scale=out_range=tv,format=yuv420p', ...tags, '-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', String(args.crf || 18), '-profile:v', 'high', '-g', String(fps * 2)];
  mkdirSync(segDir, { recursive: true }); mkdirSync(dirname(out), { recursive: true });
  const segs = [];
  for (let a = F0; a < F1; a += segN) {
    const b = Math.min(F1, a + segN), f = join(segDir, `seg_${String(a).padStart(6, '0')}${ext}`); segs.push(f);
    if (existsSync(f) && statSync(f).size > 1000 && !args.force) { console.log(`${f} exists`); continue; }
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...enc, f + '.tmp' + ext], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Map(); let next = a, nextWrite = a; const start = Date.now();
    const writer = (async () => { while (nextWrite < b) { if (!done.has(nextWrite)) { await new Promise(r => setTimeout(r, 4)); continue; } const buf = done.get(nextWrite); done.delete(nextWrite); nextWrite++; if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); } })();
    await Promise.all(pages.map(async page => { while (next < b) { const i = next++; while (i - nextWrite > 60) await new Promise(r => setTimeout(r, 8)); done.set(i, await frameOf(page, i / fps - pre)); } }));
    await writer; ff.stdin.end(); await new Promise(r => ff.on('close', r));
    renameSync(f + '.tmp' + ext, f);
    console.log(`${f}  frames ${a}-${b - 1}  ${((Date.now() - start) / (b - a)).toFixed(0)} ms/frame`);
  }
  writeFileSync(join(segDir, 'list.txt'), segs.map(s => `file '${resolve(s)}'`).join('\n') + '\n');
  const audio = args.audio && existsSync(args.audio);
  if (args.audio && !audio) console.log(`no audio file at ${args.audio}; writing video only`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(segDir, 'list.txt'),
    ...(audio ? ['-ss', String(Math.max(0, from)), '-i', args.audio, '-map', '0:v', '-map', '1:a'] : []), '-c:v', 'copy',
    ...(audio && from < 0 ? ['-af', `adelay=${Math.round(-from * 1000)}:all=1`] : []),
    ...(audio ? (pro ? ['-c:a', 'pcm_s24le'] : ['-c:a', 'aac', '-b:a', String(args.abr || '320k'), '-ar', '48000']) : []),
    '-movflags', '+faststart', '-t', String(to - from), out]);
  // verification summary
  const p = spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,color_range,width,height,nb_read_packets,duration', '-show_entries', 'format=duration,size,bit_rate', '-of', 'compact', out], { encoding: 'utf8' });
  console.log(p.stdout.trim());
  const d = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
  console.log(d.stderr.trim() ? 'DECODE ERRORS:\n' + d.stderr.trim() : 'decodes cleanly');
  console.log(`wrote ${out}  (starts at t = ${+from.toFixed(4)}: video time = t ${from < 0 ? '+ ' + (-from) : '- ' + from})${solo ? `, only scene "${solo}"` : ''}`);
  if (!pro) console.log(`next: node tools/metrics.mjs --video=${out} --probe=out/probe.json${Math.abs(from + pre) > 1e-6 ? ` --start=${+from.toFixed(4)}` : ''} --graph=${out.replace(/\.\w+$/, '')}.metrics.png`);
} else console.log('nothing to do: pass --stills, --sheet, --strip, --onion, --trails, --probe or --video (see the header)');
await browser.close();
