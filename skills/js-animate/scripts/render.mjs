// render.mjs: render a code-drawn animation page to stills, contact sheets, motion views, probe data or video.
//
// Page contract (assets/project/src/studio.js implements all of it):
//   window.ready === true     once fonts and assets are loaded
//   window.renderAt(t)        draws time t (seconds; negative in a pre-roll) and returns a PNG data URL (may be a Promise)
//   window.DURATION           length in seconds (or --duration, or the length of --audio)
//   window.PREROLL            silence before t = 0 (or --preroll)
//   window.probe(t)           optional: what's on screen at t (scene, camera, marks, tracks, plan, state), for --probe,
//                             --trails and tools/checks.mjs
//   window.SCENES, META       optional: [{ name, t0, t1, tempo }] for --scene, and the header of probe.json
//
// Needs puppeteer-core (npm i), ffmpeg on PATH, and Google Chrome. Node finds puppeteer-core from this script's folder
// upward, so keep the script inside the project (tools/). All times are timeline times t; video time = t + pre-roll.
//
// GPU: Metal on macOS; on Linux, ANGLE on Vulkan with framebuffer fetch switched off (Mesa's emulation of it drops
// overlapping 'multiply' fills). The GL renderer is printed at launch. A page that draws with WebGL stops if Chrome only
// has a software renderer (SwiftShader, llvmpipe) unless --allow-software, defaults to 2 workers, and stops on a lost
// WebGL context (rerun with fewer --workers) instead of writing black frames.
//
// Looking at frames
//   --stills=1.5,59.3 [--out=out/stills]              PNGs. --compare=ref.png diffs the (first) still against an approved one
//   --sheet=0:240:3 | --sheet=1,2.5,7 | --sheet=all[:N]  a labelled contact sheet (all = the whole timeline in N tiles, 24)
//   --strip=a:b[:step]                                every drawing from a to b (step 1/12 s), labelled: motion as a grid
//   --onion=a:b[:step]                                frames a..b averaged into one image, the last on top: spacing, arcs
//   --trails=a:b [--screen]                           the frame at b with each tracked point's path dotted frame by frame
//                                                     (pinned to the world as seen at b; --screen for screen positions)
//   --grid="q1|q2|q3" --t=1.5,9                       the same times under different query variants, a column per variant
//                                                     (an empty variant is the page as it is): alternatives side by side
//   [--cols=6] [--w=320] [--out=out/x.png] [--crop=x,y,w,h]   (--crop: a full-resolution detail of every frame)
// Data
//   --probe [--out=out/probe.json] [--every=1]        window.probe(t) for every frame (or every N), for tools/checks.mjs
//   --eval="expr"                                     print an expression's value in the ready page (after --setup)
// Checking
//   --sweep[=0.5]       syntax-check every script under the page's folder, then draw a frame every 0.5 s and at each
//                       scene's first and last frame, and list page errors, console errors and warnings, non-finite numbers
//                       passed to canvas drawing calls (a NaN coordinate draws nothing, silently) and WebGL errors.
//                       Exits 1 on anything but warnings. --syntax: the syntax check alone.
// Video
//   --video [--out=out/video.mp4] [--audio=song.wav] [--from=A --to=B] [--fps=24 --crf=18 --seg=20 --workers=6]
//       renders segments into <out>.segs/, joins them with -c copy, muxes the audio (delayed by the pre-roll, padded with
//       silence to the end) and verifies the result: frame count, audio present, a full decode. Any failure exits 1.
//       Segments are hashed: <out>.segs/manifest.json records every file the page loaded, the query, --setup, size, fps,
//       pre-roll and encoder settings, and a segment made under different ones is rendered again (it says what changed).
//       --force re-renders every segment. --redo=a:b re-renders only the stale segments that overlap timeline a..b and
//       keeps the rest, stale or not (it lists them): for a change you know is local.
//   --aend=T            the audio stops at song time T, faded over its last 0.6 s (a click at the end of an export)
//   --review            a 540p review copy: drawn at --size and scaled down (lanczos). --scale=WxH for any other size
//   --prores[=4444]     ProRes 422 HQ .mov for an editor; =4444 adds alpha (the page gets ?alpha)
//   --patch=a:b --base=old.mp4 [--start=T] [--out=new.mp4]
//       re-render timeline a..b and splice it into old.mp4 without touching the rest: the span widens to old.mp4's
//       keyframes, the new frames are encoded with this run's settings (pass the ones old.mp4 was made with: --size,
//       --review, --crf, --query), the audio is copied. --start: the timeline time of old.mp4's first frame
//       (default: minus the pre-roll). Writes <old>.patched.mp4 unless --out.
// Anywhere
//   --scene=name        limit --video, --probe and --sheet=all to one scene's span
//   --solo              draw only that scene (?solo=name), so frames past its ends continue it instead of its neighbours
//   --handles=N         extend the span N frames each side (implies --solo): shots for an editor
//   --setup="expr"      run in every page once it's ready, before anything is drawn (hide a figure, try a camera); it
//                       counts in the segment hash
//   --query="k=v&flag"  --size=1920x1080  --preroll=S  --duration=S  --workers=N  --allow-software
//   An uncaught error while the page loads stops every mode (the syntax check runs and names the file and line);
//   --allow-errors renders anyway.
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, relative, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (!args.page) { console.log('usage: see the header of render.mjs'); process.exit(1); }
const die = m => { console.error(m); process.exit(1); };
const CHROME = args.chrome || process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const fps = +(args.fps || 24), [VW, VH] = String(args.size || '1920x1080').split('x').map(Number);
const pro = args.prores ? (String(args.prores) === '4444' ? '4444' : 'hq') : null;
const solo = args.scene && (args.solo || args.handles) ? args.scene : null;
const query = [args.query, pro === '4444' ? 'alpha' : '', solo ? 'solo=' + encodeURIComponent(solo) : ''].filter(s => s && s !== true).join('&');
const pageDir = dirname(resolve(args.page)), pageURL = pathToFileURL(pageDir).href + '/';
const crop = args.crop ? String(args.crop).split(',').map(Number) : null;
if (crop && (crop.length !== 4 || crop.some(v => !Number.isFinite(v)))) die('--crop=x,y,w,h (pixels of the full frame)');
if (crop && (args.video || args.patch || args.probe)) die('--crop is for looking at frames (stills, sheets, strips, grids), not video');
const scale = args.scale ? String(args.scale).replace('x', ':') : args.review ? (VW >= VH ? '-2:540' : '540:-2') : null;
const sha = b => createHash('sha256').update(b).digest('hex');

// every script under the page's folder, parsed the way the browser will: a SyntaxError gets its file and line here,
// instead of surfacing later as a ReferenceError somewhere else
function syntaxCheck() {
  const bad = [], skip = new Set(['node_modules', 'out', 'dist', 'build']), tmp = join(tmpdir(), `ja_syntax_${process.pid}.mjs`);
  let n = 0;
  const walk = (d, depth) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || skip.has(e.name) || e.name.endsWith('.segs')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { if (depth < 5) walk(p, depth + 1); continue; }
      if (!/\.(m?js|cjs)$/.test(e.name) || statSync(p).size > 8e6) continue;
      n++;
      const code = readFileSync(p, 'utf8'), rel = relative(pageDir, p);
      if (!/\.mjs$/.test(p) && !/^\s*(import\s*[\w{*'"]|export\s)/m.test(code)) {
        try { new vm.Script(code, { filename: rel }); } catch (e) { bad.push(String(e.stack).split('\n').slice(0, 5).join('\n')); }
        continue;
      }
      writeFileSync(tmp, code);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      if (r.status) bad.push(r.stderr.split(tmp).join(rel).trim().split('\n').slice(0, 5).join('\n'));
    }
  };
  walk(pageDir, 0); rmSync(tmp, { force: true });
  return { n, bad };
}
if (args.sweep || args.syntax) {
  const { n, bad } = syntaxCheck();
  if (bad.length) die(`SYNTAX ERRORS (${bad.length} of ${n} scripts):\n\n${bad.join('\n\n')}`);
  console.log(`syntax: all ${n} scripts under ${relative(process.cwd(), pageDir) || '.'} parse`);
  if (!args.sweep) process.exit(0);
}

const gpu = process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-gl-extensions=GL_EXT_shader_framebuffer_fetch GL_EXT_shader_framebuffer_fetch_non_coherent GL_ARM_shader_framebuffer_fetch'];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--allow-file-access-from-files', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', ...gpu, `--window-size=${VW},${VH}`, '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });

// injected before the page's own scripts: keeps the page's WebGL contexts, counts unplanned context losses, and for
// --sweep notes non-finite numbers passed to canvas drawing calls (the call is silently skipped)
const HOOK = sweep => {
  const S = window.__JA = { gl: [], lost: 0, nan: [] }, raw = HTMLCanvasElement.prototype.getContext;
  S.renderer = () => {
    const c = document.createElement('canvas'), g = raw.call(c, 'webgl2') || raw.call(c, 'webgl'); if (!g) return null;
    const e = g.getExtension('WEBGL_debug_renderer_info'), r = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    g.getExtension('WEBGL_lose_context')?.loseContext(); return r;
  };
  for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
    if (!C) continue;
    const get = C.prototype.getContext;
    C.prototype.getContext = function (type, ...a) {
      const g = get.call(this, type, ...a);
      if (g && /webgl/i.test(type) && !S.gl.includes(g)) {
        S.gl.push(g);
        // a loss the page asks for (three.js forceContextLoss) is planned; any other is a failure
        const ge = g.getExtension.bind(g);
        g.getExtension = n => { const x = ge(n); if (x && /lose_context/i.test(n) && !x.__ja) { x.__ja = 1; const lc = x.loseContext.bind(x); x.loseContext = () => { g.__jaBye = 1; lc(); }; } return x; };
        this.addEventListener('webglcontextlost', () => { if (!g.__jaBye) S.lost++; });
      }
      return g;
    };
  }
  if (!sweep) return;
  const fmt = v => typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 100) / 100 : String(v)) : typeof v;
  const calls = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'translate', 'scale', 'rotate', 'transform', 'setTransform', 'createLinearGradient', 'createRadialGradient', 'createConicGradient'];
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D, window.Path2D]) {
    if (!C) continue;
    for (const m of calls) {
      const f = C.prototype[m]; if (typeof f !== 'function') continue;
      C.prototype[m] = function (...a) {
        if (S.nan.length < 20 && a.some(v => typeof v === 'number' && !Number.isFinite(v))) S.nan.push({ call: `${m}(${a.map(fmt).join(', ')})`, at: (new Error().stack.split('\n')[2] || '').trim() });
        return f.apply(this, a);
      };
    }
  }
};
const EVAL = async e => {
  try { const v = await (0, eval)(e); if (typeof v === 'string') return { v }; try { return { v: JSON.stringify(v, null, 1) ?? String(v) }; } catch { return { v: String(v) }; } }
  catch (err) { return { error: err?.stack || String(err) }; }
};

const loaded = new Set();
let sweepLog = null, gpuChecked = false, usesGL = false;
async function openPage(tag = '', q = query, tries = 3) {
  for (let i = 0; ; i++) {
    const page = await browser.newPage(), loadErrors = [];
    await page.evaluateOnNewDocument(HOOK, !!args.sweep);
    page.on('console', m => { const ty = m.type(); if (!['error', 'warn', 'warning'].includes(ty)) return; if (sweepLog) sweepLog(ty === 'error' ? 'console error' : 'console warning', m.text()); else console.log(`[page${tag}]`, m.text()); });
    page.on('pageerror', e => { if (sweepLog) sweepLog('page error', e.message); else { loadErrors.push(e.message); console.log(`[page error${tag}]`, e.message); } });
    page.on('request', r => { const u = r.url(); if (u.startsWith('file:')) loaded.add(fileURLToPath(u.split(/[?#]/)[0])); });
    try {
      await page.goto(pathToFileURL(resolve(args.page)).href + '?render' + (q ? '&' + q : ''), { waitUntil: 'load' });
      await page.waitForFunction('window.ready === true', { timeout: 120000 });
    } catch (e) {
      await page.close();
      if (i + 1 < tries) { console.log(`[page${tag}] retrying: ${e.message}`); continue; }
      const { bad } = syntaxCheck(); if (bad.length) console.error(`the page never got ready; SYNTAX ERRORS:\n\n${bad.join('\n\n')}`);
      throw e;
    }
    // an uncaught error while loading leaves the page half-built (a scene that never registered still renders, as nothing)
    if (loadErrors.length && !args['allow-errors']) { const { bad } = syntaxCheck(); die(`the page threw while loading: ${loadErrors.join('; ')}${bad.length ? `\n\nSYNTAX ERRORS:\n\n${bad.join('\n\n')}` : ''}\n(--allow-errors renders anyway)`); }
    loadErrors.length = 0;
    if (args.setup) { const r = await page.evaluate(EVAL, String(args.setup)); if (r.error) die(`--setup failed:\n${r.error}`); }
    if (!gpuChecked) { gpuChecked = true; await gpuCheck(page); }
    return page;
  }
}
async function gpuCheck(page) {
  const r = await page.evaluate(() => ({ renderer: window.__JA.renderer(), gl: window.__JA.gl.length }));
  usesGL = r.gl > 0;
  const soft = !r.renderer || /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r.renderer);
  console.log(`GPU: ${r.renderer || 'no WebGL'}${usesGL ? ` (the page draws with WebGL: ${r.gl} context${r.gl > 1 ? 's' : ''})` : ''}`);
  if (soft && usesGL && !args['allow-software']) die(`the page draws with WebGL but Chrome has ${r.renderer ? 'only a software renderer' : 'no WebGL'}: frames would be slow or wrong. Check the GPU flags (header of render.mjs) or pass --allow-software`);
}
// n pages; without an explicit --workers, a WebGL page gets at most 2 (more contexts get lost)
async function pool(n) {
  const first = await openPage('#0');
  const k = Math.max(1, args.workers || !usesGL ? n : Math.min(2, n));
  return [first, ...await Promise.all(Array.from({ length: k - 1 }, (_, w) => openPage('#' + (w + 1))))];
}
const frameOf = async (page, t) => {
  const url = await page.evaluate(async (t, crop) => {
    const u = await window.renderAt(t), S = window.__JA;
    if (S.lost || S.gl.some(g => !g.__jaBye && g.isContextLost())) throw new Error(`WebGL context lost drawing t = ${t}: rerun with fewer --workers`);
    if (!crop || typeof u !== 'string') return u;
    const im = new Image(); im.src = u; await im.decode();
    const c = document.createElement('canvas'); c.width = crop[2]; c.height = crop[3]; c.getContext('2d').drawImage(im, -crop[0], -crop[1]);
    return c.toDataURL('image/png');
  }, t, crop);
  if (typeof url !== 'string' || !url.startsWith('data:')) throw new Error(`renderAt(${t}) returned ${typeof url}, not a data URL`);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
};
const run = (cmd, a) => new Promise((ok, bad) => { const p = spawn(cmd, a, { stdio: 'inherit' }); p.on('close', c => c ? bad(new Error(`${cmd} exited ${c}`)) : ok()); });
const list = s => String(s).split(',').map(Number);
const range = (a, b, s) => { const r = []; for (let t = a; t <= b + 1e-9; t += s) r.push(+t.toFixed(5)); return r; };
const ab = (spec, step) => { const [a, b, s] = String(spec).split(':').map(Number); if (!(b > a)) die(`need a:b with b > a, got ${spec}`); return range(a, b, s || step); };
const probeJSON = (f, ...q) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', ...q, '-of', 'json', f], { encoding: 'utf8' }).stdout || '{}');
const frameCount = f => +(probeJSON(f, '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets').streams?.[0]?.nb_read_packets ?? NaN);
const mediaDuration = f => +(probeJSON(f, '-show_entries', 'format=duration').format?.duration ?? NaN);
// render times on a pool of pages, results in order
async function renderMany(ts, pages) { const out = new Array(ts.length); let next = 0; await Promise.all(pages.map(async p => { while (next < ts.length) { const i = next++; out[i] = await frameOf(p, ts[i]); } })); return out; }
// the timeline span, narrowed by --scene / --handles / --from / --to
async function span(page) {
  const i = await page.evaluate(() => ({ dur: window.DURATION, pre: window.PREROLL || 0, scenes: window.SCENES || null, meta: window.META || null }));
  let dur = +(args.duration ?? i.dur);
  const pre = +(args.preroll ?? i.pre);
  if (!(dur > 0) && args.audio && existsSync(args.audio)) { dur = mediaDuration(args.audio); console.log(`duration ${dur} s, the length of ${args.audio}`); }
  if (!(dur > 0)) die('no duration: set window.DURATION, or pass --duration or --audio');
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
  // each label from its own file, unexpanded: a label can hold any character (a query's = & % ,)
  labels.forEach((l, i) => writeFileSync(join(dir, `l${i}.txt`), l));
  const rows = Math.ceil(bufs.length / cols), esc = s => s.replace(/[:'\\,]/g, m => '\\' + m);
  const text = labels.map((l, i) => `drawtext=textfile='${esc(join(dir, `l${i}.txt`))}':expansion=none:x=6:y=6:fontsize=${Math.round(w / 16)}:fontcolor=white:box=1:boxcolor=black@0.6:enable='eq(n\\,${i})'`).join(',');
  const go = vf => spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', join(dir, 'f%04d.png'), '-vf', vf, '-frames:v', '1', out], { stdio: 'inherit' }).status;
  // no drawtext in this ffmpeg build: tiles without labels
  if (go(`scale=${w}:-2,${text},tile=${cols}x${rows}`)) go(`scale=${w}:-2,tile=${cols}x${rows}`);
  rmSync(dir, { recursive: true, force: true });
}
const saveURL = (url, out) => { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); };
const LOAD = `const load = src => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('decode failed')); im.src = src; });`;

// ---------------- video encoding, shared by --video and --patch ----------------
const tags = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
const toTV = 'scale=out_range=tv:out_color_matrix=bt709';
const enc = pro === '4444' ? ['-vf', 'format=yuva444p10le', '-c:v', 'prores_ks', '-profile:v', '4444', '-vendor', 'apl0', ...tags]
  : pro ? ['-vf', `${toTV},format=yuv422p10le`, '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', ...tags]
  : ['-vf', [scale ? `scale=${scale}:flags=lanczos` : '', toTV, 'format=yuv420p'].filter(Boolean).join(','), ...tags, '-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', String(args.crf || 18), '-profile:v', 'high', '-g', String(fps * 2)];
// frames a..b-1 (frame i is timeline time tOf(i)) piped as PNGs into one encode; written to file only when complete
async function encodeFrames(pages, a, b, file, tOf) {
  const tmp = file.replace(/(\.\w+)$/, '.tmp$1');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...enc, tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise(r => ff.on('close', r)); ff.stdin.on('error', () => {});
  const done = new Map(); let next = a, nextWrite = a; const start = Date.now();
  const writer = (async () => { while (nextWrite < b) { if (!done.has(nextWrite)) { await new Promise(r => setTimeout(r, 4)); continue; } const buf = done.get(nextWrite); done.delete(nextWrite); nextWrite++; if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); } })();
  await Promise.all(pages.map(async page => { while (next < b) { const i = next++; while (i - nextWrite > 60) await new Promise(r => setTimeout(r, 8)); done.set(i, await frameOf(page, tOf(i))); } }));
  await writer; ff.stdin.end();
  const code = await closed;
  if (code) throw new Error(`ffmpeg exited ${code} encoding ${file}`);
  const n = frameCount(tmp);
  if (n !== b - a) throw new Error(`${file}: ${n} frames encoded, expected ${b - a}`);
  renameSync(tmp, file);
  return (Date.now() - start) / (b - a);
}
// after every video: what's in it, frame count, audio, a full decode. Problems set the exit code.
function verify(out, frames, audio) {
  const p = spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,color_range,width,height,nb_read_packets,duration', '-show_entries', 'format=duration,size,bit_rate', '-of', 'compact', out], { encoding: 'utf8' });
  console.log(p.stdout.trim());
  const bad = [], n = frameCount(out);
  if (n !== frames) bad.push(`FRAME COUNT: ${n}, expected ${frames}`);
  if (audio && !/codec_type=audio/.test(p.stdout)) bad.push('NO AUDIO STREAM');
  const d = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
  if (d.status || d.stderr.trim()) bad.push('DECODE ERRORS:\n' + d.stderr.trim());
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; } else console.log(`verified: ${n} frames${audio ? ', audio present' : ''}, decodes cleanly`);
  return !bad.length;
}
// the files the page loaded (or, if none were seen, every file under its folder but out/), hashed; size and mtime
// let unchanged files skip re-hashing
function sourceHashes(cache) {
  let fs = [...loaded].filter(f => existsSync(f) && statSync(f).isFile());
  if (!fs.length) { const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') || ['node_modules', 'out'].includes(e.name) || e.name.endsWith('.segs') ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]); fs = walk(pageDir); }
  const files = {};
  for (const f of fs.sort()) {
    const st = statSync(f), rel = relative(pageDir, f) || basename(f), c = cache[rel];
    files[rel] = c && c[0] === st.size && c[1] === st.mtimeMs ? c[2] : sha(readFileSync(f));
    cache[rel] = [st.size, st.mtimeMs, files[rel]];
  }
  return files;
}

try {
if (args.eval) {
  const page = await openPage(), r = await page.evaluate(EVAL, String(args.eval));
  if (r.error) { console.error(r.error); process.exitCode = 1; } else console.log(r.v);
} else if (args.sweep) {
  const found = new Map(); let at = 'load';
  const note = (kind, msg, key = msg) => { const k = kind + '|' + key, f = found.get(k) || { kind, msg: msg.split(pageURL).join(''), ts: [] }; if (f.ts[f.ts.length - 1] !== at) f.ts.push(at); found.set(k, f); };
  sweepLog = note;
  const page = await openPage(), sp = await span(page), step = args.sweep === true ? .5 : +args.sweep, last = sp.to - 1 / fps;
  const ts = new Set(range(sp.from, last, step));
  for (const s of sp.scenes || []) for (const t of [s.t0, s.t1 - 1 / fps]) if (t >= sp.from && t <= last) ts.add(+t.toFixed(5));
  const order = [...ts].sort((a, b) => a - b);
  for (const t of order) {
    at = t;
    await page.evaluate(() => { window.__JA.nan = []; });
    try { await frameOf(page, t); } catch (e) { note('draw error', e.message); }
    const r = await page.evaluate(() => { const S = window.__JA, gl = []; for (const g of S.gl) { if (g.isContextLost()) continue; for (let k = 0, e; k < 4 && (e = g.getError()); k++) gl.push('0x' + e.toString(16)); } return { nan: S.nan, gl }; });
    for (const x of r.nan) note('non-finite', `${x.call} ${x.at}`, x.at);
    if (r.gl.length) note('WebGL error', r.gl.join(' '));
  }
  await new Promise(r => setTimeout(r, 100));
  const rows = [...found.values()].sort((a, b) => (a.kind === 'console warning') - (b.kind === 'console warning') || (typeof a.ts[0] === 'number' ? a.ts[0] : -1e9) - (typeof b.ts[0] === 'number' ? b.ts[0] : -1e9));
  const when = ts => { const n = ts.filter(t => typeof t === 'number'); return (ts.includes('load') ? 'load ' : '') + (n.length ? `t ${n[0].toFixed(2)}${n.length > 1 ? `–${n[n.length - 1].toFixed(2)} (${n.length}×)` : ''}` : ''); };
  for (const f of rows) console.log(`${f.kind.padEnd(15)} ${when(f.ts).padEnd(22)} ${f.msg}`);
  const errors = rows.filter(f => f.kind !== 'console warning').length;
  console.log(`\nsweep: ${order.length} frames from t ${sp.from.toFixed(2)} to ${last.toFixed(2)}: ${errors} problem(s), ${rows.length - errors} warning(s)`);
  if (errors) process.exitCode = 1;
} else if (args.stills) {
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
} else if (args.grid) {
  const vars = String(args.grid).split('|'), ts = list(args.t ?? 0), out = args.out || 'out/grid.png';
  const pages = []; for (const [j, v] of vars.entries()) pages.push(await openPage('#' + j, [query, v].filter(Boolean).join('&')));
  const bufs = [], labels = [];
  for (const t of ts) for (const [j, p] of pages.entries()) { bufs.push(await frameOf(p, t)); labels.push(`${vars[j] || 'as is'}  ${t}s`); }
  tile(bufs, labels, out, vars.length, +(args.w || 480));
  console.log(`${out}  (${vars.length} variants × ${ts.length} times; a column per variant)`);
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
  // one frame per line: grep by time
  writeFileSync(out, JSON.stringify(head).slice(0, -1) + ',"frames":[\n' + frames.map(f => JSON.stringify(f)).join(',\n') + '\n]}\n');
  console.log(`${out}  (${frames.length} frames, ${((Date.now() - start) / frames.length).toFixed(0)} ms/frame)  next: node tools/checks.mjs --probe=${out}`);
} else if (args.patch) {
  const base = args.base, ext = pro ? '.mov' : '.mp4';
  if (!base || !existsSync(base)) die('--patch=a:b needs --base=old.mp4 (the video to splice into)');
  const out = args.out || base.replace(/(\.\w+)$/, '.patched$1');
  if (resolve(out) === resolve(base)) die('--out must differ from --base');
  const pages = await pool(+(args.workers || 6)), sp = await span(pages[0]), start = args.start != null ? +args.start : -sp.pre;
  const v = probeJSON(base, '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,start_time').streams?.[0];
  if (!v) die(`no video stream in ${base}`);
  const [rn, rd] = v.r_frame_rate.split('/').map(Number);
  if (Math.abs(rn / (rd || 1) - fps) > 1e-3) die(`${base} is ${v.r_frame_rate} fps; this run is ${fps} (--fps)`);
  const N = frameCount(base), t0 = +(v.start_time || 0);
  const keys = [...new Set((probeJSON(base, '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags').packets || []).filter(p => p.flags?.includes('K')).map(p => Math.round((+p.pts_time - t0) * fps)))].sort((a, b) => a - b);
  const [pa, pb] = String(args.patch).split(':').map(Number);
  if (!(pb > pa)) die(`--patch=a:b with b > a (timeline seconds), got ${args.patch}`);
  const fa = Math.max(0, Math.min(N, Math.round((pa - start) * fps))), fb = Math.max(0, Math.min(N, Math.round((pb - start) * fps)));
  const ka = Math.max(0, ...keys.filter(k => k <= fa));
  let kb = Math.min(N, ...keys.filter(k => k >= fb));
  if (kb <= ka) kb = Math.min(N, ...keys.filter(k => k > ka));
  if (kb <= ka) die(`--patch=${args.patch} is outside ${base} (frames 0–${N - 1}, from t = ${start})`);
  const dir = out + '.patch'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  console.log(`patching frames ${ka}–${kb - 1} of ${N} (t ${(start + ka / fps).toFixed(3)}–${(start + kb / fps).toFixed(3)}, widened from ${pa}–${pb} to ${base}'s keyframes)`);
  const mid = join(dir, 'mid' + ext), ms = await encodeFrames(pages, ka, kb, mid, i => start + i / fps);
  const m = probeJSON(mid, '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt').streams[0];
  if (m.width !== v.width || m.height !== v.height || m.codec_name !== v.codec_name || m.pix_fmt !== v.pix_fmt) die(`the new frames are ${m.codec_name} ${m.width}×${m.height} ${m.pix_fmt} but ${base} is ${v.codec_name} ${v.width}×${v.height} ${v.pix_fmt}: pass the --size/--review/--scale/--prores it was made with`);
  // cut the old video at the two keyframes, copying: head = frames before ka, tail = frames from kb on
  const cuts = [ka, kb].filter(k => k > 0 && k < N);
  if (cuts.length) await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', base, '-map', '0:v', '-c', 'copy', '-f', 'segment', '-segment_frames', cuts.join(','), '-reset_timestamps', '1', join(dir, 'part%03d' + ext)]);
  const parts = readdirSync(dir).filter(f => f.startsWith('part')).sort().map(f => join(dir, f));
  const head = ka > 0 ? parts[0] : null, tail = kb < N ? parts[parts.length - 1] : null;
  if (head && frameCount(head) !== ka) die(`splitting ${base}: the part before frame ${ka} has ${frameCount(head)} frames`);
  if (tail && frameCount(tail) !== N - kb) die(`splitting ${base}: the part from frame ${kb} has ${frameCount(tail)} frames, expected ${N - kb}`);
  writeFileSync(join(dir, 'list.txt'), [head, mid, tail].filter(Boolean).map(s => `file '${resolve(s)}'`).join('\n') + '\n');
  const hasAudio = !!probeJSON(base, '-select_streams', 'a', '-show_entries', 'stream=index').streams?.length;
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), ...(hasAudio ? ['-i', base, '-map', '0:v', '-map', '1:a'] : []), '-c', 'copy', '-movflags', '+faststart', out]);
  if (verify(out, N, hasAudio)) rmSync(dir, { recursive: true, force: true });
  console.log(`wrote ${out}: ${base} with frames ${ka}–${kb - 1} re-rendered (${ms.toFixed(0)} ms/frame)`);
} else if (args.video) {
  const pages = await pool(+(args.workers || 6)), sp = await span(pages[0]), { pre, from, to } = sp;
  const ext = pro ? '.mov' : '.mp4', out = args.out || 'out/video' + ext, segDir = args.dir || out + '.segs';
  const F0 = Math.round((from + pre) * fps), F1 = Math.round((to + pre) * fps), segN = Math.round(+(args.seg || 20) * fps);
  mkdirSync(segDir, { recursive: true }); mkdirSync(dirname(out), { recursive: true });
  const manPath = join(segDir, 'manifest.json');
  const man = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : {};
  man.keys ||= {}; man.segs ||= {}; man.cache ||= {};
  const settings = { size: [VW, VH], fps, pre, query, setup: args.setup || null, enc, ext };
  const files = sourceHashes(man.cache), key = sha(JSON.stringify({ settings, files })).slice(0, 16);
  man.keys[key] = { settings, files, chrome: await browser.version(), first: man.keys[key]?.first || new Date().toISOString() };
  const save = () => { const used = new Set(Object.values(man.segs).map(s => s.key)); for (const k of Object.keys(man.keys)) if (!used.has(k) && k !== key) delete man.keys[k]; writeFileSync(manPath, JSON.stringify(man, null, 1)); };
  const why = k => { const o = man.keys[k]; if (!o) return 'made before segments were hashed'; const ch = [...new Set([...Object.keys(o.files), ...Object.keys(files)])].filter(f => o.files[f] !== files[f]), st = Object.keys(settings).filter(s => JSON.stringify(o.settings[s]) !== JSON.stringify(settings[s])); return [...ch.slice(0, 4), ...(ch.length > 4 ? [`${ch.length - 4} more files`] : []), ...st.map(s => `${s} setting`)].join(', ') + ' changed'; };
  const redo = args.redo ? String(args.redo).split(':').map(Number) : null;
  console.log(`${Object.keys(files).length} source files hashed (${key}); segments in ${segDir}`);
  const segs = [], reasons = new Map(), kept = [];
  for (let a = F0; a < F1; a += segN) {
    const b = Math.min(F1, a + segN), name = `seg_${String(a).padStart(6, '0')}${ext}`, f = join(segDir, name), rec = man.segs[name]; segs.push(f);
    const exists = existsSync(f) && statSync(f).size > 1000;
    if (exists && !args.force) {
      if (rec?.key === key && rec.b === b) { console.log(`${f} up to date`); continue; }
      const inRedo = redo && a / fps - pre < redo[1] && b / fps - pre > redo[0];
      if (redo && !inRedo) {
        if (frameCount(f) !== b - a) die(`${f} has the wrong length for this span; it can't be kept: drop --redo or change --from/--to/--seg back`);
        kept.push(`${name} (${why(rec?.key)})`); man.segs[name] = { key: rec?.key || 'unknown', a, b }; console.log(`${f} kept, stale (--redo)`); continue;
      }
      const r = rec?.b === b ? why(rec?.key) : 'segment length changed'; reasons.set(r, (reasons.get(r) || 0) + 1);
      console.log(`${f} stale: ${r}`);
    }
    const ms = await encodeFrames(pages, a, b, f, i => i / fps - pre);
    man.segs[name] = { key, a, b }; save();
    console.log(`${f}  frames ${a}-${b - 1}  ${ms.toFixed(0)} ms/frame`);
  }
  save();
  writeFileSync(join(segDir, 'list.txt'), segs.map(s => `file '${resolve(s)}'`).join('\n') + '\n');
  const audio = args.audio && existsSync(args.audio);
  if (args.audio && !audio) console.log(`no audio file at ${args.audio}; writing video only`);
  // audio: from the song at max(0, from), cut at --aend with a 0.6 s fade, delayed by the pre-roll, then silence to the end
  const ae = args.aend != null ? +args.aend - Math.max(0, from) : null;
  const af = [...(ae != null ? [`atrim=end=${ae}`, `afade=t=out:st=${Math.max(0, ae - .6)}:d=0.6`] : []), ...(from < 0 ? [`adelay=${Math.round(-from * 1000)}:all=1`] : []), 'apad'].join(',');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(segDir, 'list.txt'),
    ...(audio ? ['-ss', String(Math.max(0, from)), '-i', args.audio, '-map', '0:v', '-map', '1:a', '-af', af] : []), '-c:v', 'copy',
    ...(audio ? (pro ? ['-c:a', 'pcm_s24le'] : ['-c:a', 'aac', '-b:a', String(args.abr || '320k'), '-ar', '48000']) : []),
    '-movflags', '+faststart', '-t', String((F1 - F0) / fps), out]);
  if (reasons.size) console.log(`re-rendered stale segments: ${[...reasons].map(([r, n]) => `${n} × ${r}`).join('; ')}`);
  if (kept.length) console.log(`KEPT STALE (--redo): ${kept.join('; ')}`);
  verify(out, F1 - F0, audio);
  console.log(`wrote ${out}  (starts at t = ${+from.toFixed(4)}: video time = t ${from < 0 ? '+ ' + (-from) : '- ' + from})${solo ? `, only scene "${solo}"` : ''}${scale ? `, scaled to ${scale}` : ''}`);
  if (!pro) console.log(`next: node tools/metrics.mjs --video=${out} --probe=out/probe.json${Math.abs(from + pre) > 1e-6 ? ` --start=${+from.toFixed(4)}` : ''} --graph=${out.replace(/\.\w+$/, '')}.metrics.png`);
} else console.log('nothing to do: pass --stills, --sheet, --strip, --onion, --trails, --grid, --probe, --eval, --sweep, --video or --patch (see the header)');
} catch (e) {
  console.error(e.stack || e.message);
  await browser.close().catch(() => {});
  process.exit(1);
}
await browser.close();
