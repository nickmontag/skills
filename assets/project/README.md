# Project name

One paragraph: what this is, who it's for, and the deliverables (formats, aspect ratios, length, due date).

## Resume here

A fresh session (or a new collaborator) reads these, in this order, before touching anything:

1. **`RULES.md`**: the person's hard rules, in their words. They override the plan and any paraphrase of it.
2. **The bottom of `REVIEW.md`**: the last decision, and what is waiting on the person.
3. **`shots.json`**: what's approved (frozen by hash), what's awaiting, and what builds on what.
   `node tools/checks.mjs --only=gate` shows any gate that's open.
4. **`STORYBOARD.md`**: the current beats, times, tempo, blocking and light.
5. **`npm test && npm run probe && npm run check`**: the engine works and nothing has regressed.

Two rules hold even when nobody repeats them: nothing builds on an item that isn't approved, and after posting
something for approval, stop and wait for the answer.

## Run it

Needs Node, Google Chrome and ffmpeg. `npm install` once.

| command | what it does |
|---|---|
| open `index.html` | the studio: scrub, play (space), step frames (←/→), jump to scenes, show the probe's marks |
| `npm run smoke` | the whole pipeline on a small scale: tests, a still, a contact sheet, a 2 s encode, probe, checks |
| `npm run sheet` | a contact sheet of the whole timeline (`out/sheet.png`) |
| `npm run probe` / `npm run check` | what's on screen, frame by frame, then every rule over it |
| `npm run video` / `npm run metrics` | the MP4, then flashes, black or grey frames, glitches, freezes, bitrate |
| `npm run review` | probe, check, video, metrics and sheet: run before showing anyone |
| `node tools/render.mjs --page=index.html --strip=3:4` | every drawing across a moment |
| `node tools/render.mjs --page=index.html --onion=3:4` / `--trails=3:4` | spacing and arcs in one image |
| `node tools/render.mjs --page=index.html --video --scene=walk --handles=12 --prores` | one shot for an editor |

## Files

| path | what it holds |
|---|---|
| `index.html` | the page: loads config, kit, timing, studio, cast and scenes, in that order |
| `src/config.js` | size, frame rate, pre-roll, safe area, audio |
| `src/kit.js` | tested helpers: easing, springs, IK, walk cycles, follow-through, particles, morphs… (`npm test`) |
| `src/studio.js` | the engine: scenes, transitions, layers, camera, the probe (`mark.*`), the dev page |
| `data/timing.js` | key moments as data; scenes never type times |
| `src/cast/` | characters, one file each |
| `src/scenes/` | one file per scene, in timeline order |
| `rules.mjs` | this project's checks, one per note from the person |
| `tools/` | render, checks, metrics and still scripts (copied from the skill) |
| `out/` | renders (not kept in git) |
