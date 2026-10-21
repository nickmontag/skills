---
name: js-animate
description: How to make animated videos in code — music videos, lyric videos, animated shorts, explainers, motion graphics, character animation — drawn with JavaScript (Canvas 2D / WebGL) as pure functions of time, rendered frame by frame in headless Chrome and encoded with ffmpeg. Covers the architecture, syncing to a song (word/letter timing, beats, lip sync), the concept-and-review loop with the person, design pitfalls (character appeal, light logic, legibility, staging), and encoding/compression traps. Use this whenever someone wants an animation or video produced programmatically, a video synced to audio, animated characters, hand-drawn-looking illustrations or memes authored as stroke data, a cartoon, anime, flat-vector or pixel-art look, rigged characters and walk cycles, a procedural art style rendered to MP4 or GIF, or asks to fix, re-time or re-render such a project — even if they never say "JavaScript" or "headless Chrome".
license: MIT
metadata:
  author: Nick Montag
---

# Animated video in code

Every frame is drawn by JavaScript in a browser page, captured by headless Chrome, and piped into ffmpeg. It gives total control of style and timing, and it's very easy to lose days to the wrong things. This skill is what matters and what goes wrong. Art style, length, tone and source material vary from project to project, so treat the examples as illustrations, not defaults.

One limitation shapes everything below: **you review by looking at stills, but animation goes wrong in time.** Pace, a single bad frame, text that lands early, a rule kept in one scene and broken in the next: none of it shows on a contact sheet. So the scaffold makes scenes report what they draw, and the tools turn time into numbers and single images (§6).

Bundled:
- `scripts/new-project.sh <folder>`: scaffolds a project from `assets/project/` and copies the tools into its `tools/`. Start every project with it, even "just a still".
- `assets/project/`: the scaffold.
  - `index.html` is the router page and dev studio: a scrubber, play, frame stepping, a scene menu, and a marks overlay.
  - `src/studio.js` is the engine: scenes, transitions, layers, the camera, the page contract, and the probe (`mark.*`).
  - `src/kit.js` holds tested helpers: easing, springs, IK, walk cycles, follow-through, particles, morphs, crescents. Run them with `npm test`.
  - `data/timing.js` holds the key moments as data. `src/cast/` and `src/scenes/` hold one file per character and per scene, with a working example of each.
  - `rules.mjs` holds the project's own checks.
  - `README.md`, `RULES.md`, `STORYBOARD.md`, `REVIEW.md` and `shots.json` are the project's memory (§4).
- `scripts/render.mjs`: renders stills, contact sheets, strips, onion skins, motion trails, probe data, and resumable video in x264 or ProRes (with handles and alpha). The header lists every mode.
- `scripts/checks.mjs`: built-in rules plus the project's own rules over the probe data, and the approval gates in `shots.json`.
- `scripts/metrics.mjs`: measures the encoded file frame by frame: black, grey, flash and stray frames, cuts, freezes, bitrate, sparklines and a graph.
- `scripts/still.sh`: one hang-safe still from plain headless Chrome (no Node).
- `references/checks-and-pace.md`: how to use the instruments, how to turn notes into rules, and the numbers for pace. The model's bias is to squeeze time.
- `references/hybrid.md`: what code can't do well, how to choose the engine for each element (Canvas, GPU code, Blender, image or video models), hand-offs, and paid-API gates.
- `references/motion-craft.md`: how things move, in any look. It covers timing and spacing, rigs and IK, walk cycles with planted feet, follow-through, smears and blur, hits and effects, the multiplane camera, and motion-graphics primitives. It gives each topic's kit signatures.
- `references/drawing-in-code.md`: drawing characters as data (not tracing), a stroke and wash vocabulary, clean cartoon and print looks in Canvas 2D, studies then scenes, turns, walking in perspective, captions pinned to characters, landing on an approved still, and rendering without Node.
- `references/styles/README.md`: an index of 34 looks (studio and TV, print, arthouse, eras, digital), each in its own short file with its tells, how to fake it and how it moves. Read the index, then open only the looks you need.
- `references/audio-timing.md`: transcribing, forced alignment (word and letter level), beats, and vocal envelopes.
- `references/review-checklist.md`: the commands to run and the things to look at before showing anyone.

**The first hour:** run `scripts/new-project.sh ~/work/name`, then `cd` in, `npm install`, then `npm run smoke`. That runs the kit tests, a still, a contact sheet, a 2-second encode checked by ffprobe and metrics, then probe and checks. It proves the whole pipeline before any art depends on it. Then replace the example cast and scenes, and fill in the README's deliverables.

## 1. Architecture that holds up

**Make every frame a pure function of time: `draw(t)`.**
- No state carried between frames, no `Math.random()`. Use a seeded RNG (`rng`) keyed on stable ids, plus the drawing number if you want "boil".
- Why: you'll render out of order, in parallel, resume after crashes, scrub to any time, and re-render one shot after a note. All of that breaks the moment frame N depends on frame N−1.
- Physics or simulations: write them in closed form (springs, arcs, decays and particles all have closed forms), replay a short fixed-step window that ends at `t` (`follow`), or precompute them once into a table indexed by time (`references/motion-craft.md` §1, §4, §6).

**Structure the timeline as data.** The scaffold does this; keep it that way.
- Each scene is its own file: `scene(name, { t0, dur, tempo, in }, fn)`, where `fn(t, lt, L)` draws into the layers. `in` is the transition into it (cut, dissolve, dip, or your own blend), and studio renders both neighbours across it.
- Key moments go in `data/timing.js` (hit times, holds, silences, onsets) and every scene looks them up by name.
- If there's audio, derive times from the timing data (e.g. "the onset of the word 'fine' in line 3"), not hand-typed numbers. Hand-typed times drift, and they're wrong the moment anything is re-aligned or re-cut.
- Helpers go in `src/kit.js` with a test, not re-typed inside scenes. Characters go in `src/cast/`, one file each. Small files are what let you edit one thing without breaking another.

**Use the page contract from the first line, even for "just a still".** Stills become GIFs, GIFs become animations. The scaffold's page already exposes `window.renderAt(t)`, `window.probe(t)`, `?t=`, `?scene=`, `?solo=`, `?raw` (canvas only, 1:1), `?alpha` and `?marks`, so it never needs a rebuild when the brief grows.

**Keep an approved still or template invariant.** Put variants (captions, alternate text, extra poses) in optional layers selected by URL, append animation-only drawings after the scene so they never shift its seeds, and after every change to shared code, compare the still (`render.mjs --stills=T --compare=approved.png`). `shots.json` freezes approved files by hash. Details: `references/drawing-in-code.md` §5–6.

**Layers, then a compositor.**
- Scenes draw into `L.bg`, `L.main`, `L.text` and `L.fx`, composited back to front. `L.fx` is on top so that flashes and fades cover everything, text included.
- Split further the way the look is made. A print look gets one canvas per ink. A cel look gets line, fill, shadow and light. Any look can split out masks, effects and each depth plane.
- Replace `studio.composite` with a WebGL fragment shader when the look needs one. For print, that's paper, how inks mix, halftone and grain. For cel and features, it's shading, bloom, depth haze and grade.
- This split is what lets one codebase switch looks completely (pencil to risograph was a new shader plus flat fills, not a rewrite). It also gives cheap per-layer effects: misregistration for print, glow on an effects layer, motion blur on just the layer that moves.

**Occlusion is your job.** In 2D, nearer things must clear what's behind them (erase or "knock out" the shape before drawing it). Forgetting this is the top cause of see-through characters and text hidden behind props. Mark characters and props with `mark.box`, and `checks.mjs` catches text they cover.

**Aspect ratios double everything.** Before building, ask which deliverables are actually needed. A second aspect ratio means every composition, text placement and render twice. In one project it was dropped at the very end, after all that work. If you do support several, lay out through a helper like `pick(landscape, portrait)` from the start rather than retrofitting.

## 2. Rendering and encoding

Use `tools/render.mjs` (the header lists every mode).
- **Render path.** puppeteer-core drives the system Chrome with GPU flags (`--use-angle=metal` on macOS). Several pages work in parallel, and lossless PNG frames are piped into ffmpeg in segments of about 20 s. Each finished segment is a file, so an interrupted render resumes. Segments are joined with `-c copy`, then the audio is muxed. Frame folders for a 4-minute 1080p video run to gigabytes, so avoid them.
- **Looking:** `--sheet=all` for the whole timeline, `--strip=a:b` for every drawing across a moment, `--onion=a:b` for spacing, and `--trails=a:b` for the paths of tracked points. `--query=marks` overlays the probe's boxes, tracks and safe area on any still.
- **Parts and hand-offs:** `--scene=name` limits a render to one scene. `--handles=N` renders the scene alone past both ends. `--prores` makes ProRes 422 HQ for an editor, and `--prores=4444` adds alpha (`references/hybrid.md`).
- **Colour range.** Convert explicitly to TV-range yuv420p and tag BT.709 (`scale=out_range=tv,format=yuv420p`, `-color_range tv -colorspace bt709 …`). JPEG intermediates otherwise come through as full-range `yuvj420p`, which some players show washed out.
- **Streaming and duration.** Use `-movflags +faststart`, and check that `moov` comes before `mdat`. Cap the output with `-t` so video and audio end together.
- **Even dimensions.** x264 refuses odd widths/heights; crop to even before `format=yuv420p`.
- **GIFs** of textured full frames are large (≈20 MB for 5 s at 900 px); ship an MP4 alongside. A 3-drawing boil loop of a still makes a small, charming GIF.
- **Silence before the audio.** Render frames from `t = −preroll` and delay the audio with `adelay` when muxing. Don't edit the audio file.
- **Verify the final file,** not just the frames. The render prints ffprobe's summary and a full decode. Then run `tools/metrics.mjs` on the file, and pull frames from the MP4 on both sides of every key hit.

**Bitrate and compression traps**
- Anything that changes every pixel every frame explodes the bitrate: film grain, per-frame exposure flicker, jittered layer offsets, paper texture that moves. One project went from 16 to 50 Mbps. `metrics.mjs` prints the bitrate per second.
- Hold texture still relative to the frame, or move it only with the camera, on purpose. Snap layer offsets to whole pixels. Save jitter for moments where it means something (a hit, a scare).
- "Boil" on twos (12 drawings a second) looks hand-made and costs half as much as boiling on ones.
- Check the bitrate on a 10-second test before committing to a look.

**Performance.** Canvas 2D with a few thousand stroke ribbons plus one shader pass renders at about 30–80 ms per 1080p frame. Six workers make a 4-minute video a 5–10 minute render. If a frame takes more than ~200 ms, profile it: it's almost always a filter, a `getImageData`, or re-parsing fonts or paths every frame. The studio shows ms per frame as you scrub.

## 3. Syncing to music (when there's a song)

Details and code are in `references/audio-timing.md`. The lessons:

- **Lyric sheets lie.**
  - Transcribe what is actually sung (Whisper) and diff it against the sheet: repeated lines, dropped words, pronunciations, lines that are never sung at all.
  - A line that's never sung can be the most powerful moment in the video (staged as silence), but only if you notice it.
  - Record every difference in a notes file.
- **Forced-align per section**, not the whole song. Whole-song alignment tends to collapse partway through. Keep letter-level spans too: they drive lip sync for free.
- **Get the beat grid, downbeats and sections**, a vocal-loudness envelope from the vocal stem (to drive mouth opening, glow, pulsing), and a list of peaks: hits, held notes, silences, instrument entrances.
- **Text appears at the sung onset, never before.** Being early is the error people notice. Mark every word with its onset; `checks.mjs` fails early and late words.
- **Put transitions on phrase boundaries**, and big physical actions after the line that sets them up, not during it.
- **Hold beats.** A question typed and left on screen in silence for two seconds lands much harder than one that flashes past. Give important moments room even if it means adding a silent pre-roll.

## 4. Working with the person: concept before code

Most rework came from building before the look and the key ideas were agreed. The loop that worked:

1. **Read the brief for what it really asks.** Deliverables, formats, constraints, "never do X". Write the timing notes and a storyboard with times before drawing anything.
   - **Decide which engine makes each element**, and say early which ones code will do badly (believable people, photoreal materials, soft organic 3D). The options are code, GPU code, Blender, an image or video model, or footage (`references/hybrid.md`). Two rejected rounds of code-drawn people cost days on one film.
   - **Prefer real sources for real things.** When the brief names something that exists (a product's UI or logo, a real place, a named dance or meme, a real person's look), look it up in real footage or the supplied assets before drawing it. Memory gets the specifics wrong, and people notice. If a key asset is missing, asking is usually cheaper than a convincing stand-in that gets redone.
2. **Show alternatives side by side.** Offer 2–3 character concepts or looks, drawn in the same key frames with the same engine, so the comparison is fair. People choose far better from pictures than from descriptions. When asked for "words only" or "a few options quickly", do exactly that: short, concrete options with a recommendation. Once the person has picked a direction, stop offering alternatives unless they ask.
3. **Make model sheets and 2–4 key frames** of the most important beats. Get a yes before the full build. For drawn characters, do **one study first** (usually the lead's head, on its own sheet), push it until it's approved, then draw the others to match it.
   - **Confirm the blocking before animating:** who moves toward or away from camera, which way each person faces at the start, what triggers each reaction. Write it as one line per character. A clever reveal ("the drawing inks itself in") is not what people mean by "animate it"; they want the story acted out.
4. **Motion-test the riskiest thing** for about 10 seconds with real audio, encoded at final settings: the new style in motion, the key transition, compression, legibility.
5. **Build the whole thing, review it yourself (§6), then show it.**
6. **Turn every note into a rule** (`references/checks-and-pace.md` §2), and log it: note → what changed → how it was verified. Notes are usually specific symptoms of general principles (§5). Fix the principle across the whole video, not just the frame they pointed at.

When recommending, recommend. Explain the trade-off in a line and name what would change your mind.

**The project's memory.** Long projects outlive a context window, so the state lives in files that a fresh session reads first. The scaffold has templates, and its README has the resume order.
- `RULES.md`: the person's hard rules, **in their words**, each naming what enforces it. Write prompts, specs and code from these words, not from a paraphrase. "Photographic" in a plan became a prompt for real photos when the person meant a stylised animated feature.
- `REVIEW.md`: every approval, note and regeneration, with the person's words.
- `STORYBOARD.md`: beats, times, tempo, blocking, light, and the engine for each.
- `shots.json`: everything that needs a yes, with its status and what it `uses`.
  - **Make each approvable thing its own item.** A page design and the states derived from it are two items. Otherwise there is never a step where the design itself gets approved.
  - **Never build on an unapproved item.** `checks.mjs` fails any item that `uses` something not yet approved.
  - **Record approvals only after the person says yes in chat** (`checks.mjs --approve=ID`). That freezes the file by hash.
- **After posting something for approval, stop and wait.** Only do work that doesn't depend on the answer.
- **Paid APIs** need the person's OK for each call, with its cost, and a wrapper that refuses a job without that OK recorded (`references/hybrid.md`).

## 5. Design lessons that generalise

**Characters**
- **Appeal and identity** come from a clear silhouette and one strong signifier of *what it is*. A generic soft blob reads as nothing.
- **Caricature is one pushed idea per character** (a craning neck, a slammed-down brow, closed-eye bliss), with everything else kept simple. That's what makes a redraw read at a glance.
  - Cute: big head or eyes relative to the body, low-set features, a small mouth.
  - Give it the details that make it a *someone*: lashes, a bow, a stance, a nervous habit.
- **If it sings or talks, it needs a mouth that can perform.** Viewers notice when the singer never sings.
  - About nine mouth shapes (rest, M/B/P, F/V, E, A, L, O, U, wide), driven by letter timing and opened by vocal loudness.
  - Eyes close on held notes; breathe before phrases.
  - Keep the singer on camera for most lines; everything else is cutaway material around it.
- **Design features that pay off later.** If the character has a scary shadow or alter ego, derive its monstrous features from real features (corners become horns, a tail becomes a barbed tail), so the transformation reads as the same being.
- **Originality:** don't copy famous characters, robots or logos, especially brand marks that sit close to the concept. Draw your own version of the idea.

**Humans are the hardest thing to draw well in code.**
- Hands especially: first attempts read as paddles and gloves.
- Prefer silhouettes, profiles, backs, reflections, or flat stylised shapes with clear finger separation and edge light. If the brief needs believable people, raise it early (§4, step 1).
- Check anatomy and pose plausibility at thumbnail size. Someone "in bed" must read as a whole body lying down, and covering them must leave a shape, not make them vanish.

**Light must be physically consistent.** People notice wrong light even when they can't say why.
- Every shadow comes from a light you can locate. The shadow falls on the far side of the object from the light, and its size depends on distance.
- One light does one job per shot. A lamp can't spotlight the character from above *and* throw its shadow up the wall behind it.
- If showing the light source makes the angle impossible, keep the source off frame and show only its light.
- Write the light rule for each scene in the storyboard, then check every shot with shadows against it.

**Style needs an opinion, ideally one that is the concept.**
- **Tracing a photo is a filter, not a style.** Edge detection and tone separation from a reference always look processed, however tuned; "more stylized" means "have an opinion". Use the reference only for placement, and author the drawing as coordinates (`references/drawing-in-code.md` §1–2).
- **Match the ambition to the brief.**
  - For an art piece, a faithful imitation of a medium on its own (pencil on paper) is timid. Pick a look whose mechanics express the theme: in a video about misalignment, a print style where fear literally misprints the ink layers.
  - For a cartoon, an explainer, a brand or a kids' piece, the opinion lives in the design, the poses and the timing, and a clean cel or flat-vector finish is right. Hand-made wobble or misregistration there reads as a mistake.
  - The table at the top of `references/styles/README.md` matches briefs to looks. Don't default to print.
- **When no look is given, build from the subject.** Compose each frame around a concrete image of what the piece is about (the product doing its thing, the character, the place), set the type as part of that composition, and let motion differ by what's moving. Big centred text on a gradient with everything fading in is a fine look when it's chosen; as the unchosen default it reads as a demo.
- Commit to strong value structure (big darks, clear light shapes) and a strict colour role per colour. Mid-grey everywhere reads as mush on a phone.
- Things that look bad in code-drawn animation: visible hands or pencils "drawing" things, busy construction lines, and too many different lettering styles. One confident treatment beats four.

**Motion is most of what reads as "animated"** (`references/motion-craft.md`).
- Ease everything that starts or stops, overlap parts by a few frames, and move living things on arcs.
- Characters on twos, the camera on ones. Hold key poses long enough to read, and keep holds alive with breath and blinks.
- Feet that are down stay down: build walks from a planted-foot cycle (`gait`), never by sliding a pose along.
- Fast moves get stretch and smears in cel looks, 180° blur in soft or 3D-ish looks, and neither in stop-motion.
- **Real actions play at real speed; skip time by cutting, never by speeding up.** First drafts almost always run too fast and too short (`references/checks-and-pace.md` §5).

**Staging and legibility**
- **Test at thumbnail and phone size.** Captions need about 44 px cap height at 1080p, and display text more.
- **Text never under a character or prop.** Give text a clear patch or bubble. Check nothing covers faces, text or the object the scene is about (gifts over a face, a weight over a face, the character over the word it's singing).
- **Labels on moving characters** ride with that character's transform but are drawn last, never grow past their finished size, are pushed apart if they overlap, and are clamped into the frame (`references/drawing-in-code.md` §7).
- **Walking in depth:** scale people about the vanishing point; draw the off-frame body (legs, hands) for when they're far and the crop shows more; check that people passing in depth never overlap in the wrong order.
- **Make key transitions big and legible, with anticipation → action → follow-through → settle.** For example, something peeling off a screen: it tugs (swells, wobbles), pops (flips, lifts), falls (arc, spin, grows, a trail), lands (squash, dust, a camera shake), then recovers (stands, looks around). Draw it on top of everything so nothing hides it, and give it time.
- **Hits deserve a physical response:** a flash, a shake, a ring, splatter, a squash. Key them to the audio onset, not a guessed time.
- **Continuous rooms with camera moves** feel better than many cuts. Use a transition that fits the medium between scenes: a page flip or sheet feed for print, a whip pan or smear for cartoons, a match morph or shape wipe for motion graphics, a light change for anything.

## 6. Reviewing your own work (before anyone else does)

A contact sheet catches composition. It can't catch pace, a single bad frame, text a few frames early, feet that slide, or a note fixed in one scene and broken in another. So review in two passes: instruments first, then eyes. Full detail: `references/checks-and-pace.md`. The checklist: `references/review-checklist.md`.

- **Scenes report what they draw.** Mark every text (with its onset), every character and prop (boxes), the points whose motion matters (tracks), anything intended to look odd (`mark.plan('flash')`), and whatever a project rule needs (`mark.state`). With the probe off, marks cost nothing.
- **`npm run probe && npm run check`.** Built-in rules cover text timing and placement, covered text, single-frame pops, reveals going backwards, sustained camera and motion speed against each scene's tempo, shot length, and the approval gates. The project's own rules come from the person's notes. A pace table closes the report.
- **`npm run video && npm run metrics`** measure the encoded file: unplanned black, grey, flash or stray frames, unexpected cuts, freezes, and bitrate per second.
- **See motion in one image:** `--trails` (planted feet pile up; arcs, eases), `--onion` (spacing), `--strip` (every drawing around each key moment).
- **Then look,** at thumbnail and full size, and judge only what's rendered, not what the code meant to draw: each defect gets a time and the evidence. Does it read? Is the light consistent? Are the poses right? Is the blocking as agreed? The checks only know what the scenes told them.
- **Every note becomes a rule** that fails on the version the note was about and passes after the fix. A note kept only in prose gets broken again.
- **Keep the review log:** what was weak → what changed → how it was checked. It makes the next round of notes faster, and it's what you hand over with the video.
- **What only the person can judge:** sound, sync feel, whether a hold is too long. Ask them to watch with sound.

## 7. Small technical gotchas

- **Seeded randomness keyed on draw order changes** when you add or remove shapes. Key seeds on stable ids, or hide items with a flag instead of removing them, and append new ones at the end.
- **Give drawing items an explicit kind.** Inferring the kind from which properties exist breaks when a new kind reuses a property name (a text outline's `stroke` width read as a stroke's point list).
- **Unioning shapes with mixed winding** leaves holes. Normalise winding and fill `nonzero`, or draw into a scratch layer and composite.
- **Knockouts on the wrong layers:** erasing only the black layer lets red or blue show through a face. Knock out every layer the object should hide.
- **Fading an object must fade its knockout too,** or it leaves a ghost of lighter background.
- **Fades and flashes go on the top layer.** A fade to black on a layer below the text leaves the title floating over black.
- **Fonts:** load them once, before `ready`. Glyph outlines (opentype.js) let you fill, knock out or animate text per letter. Wrap GSUB/feature parsing in try/catch.
- **Headless timeouts:** set `protocolTimeout: 0`, retry page opens, and wait on an explicit `window.ready`.
- **Plain `chrome --headless --screenshot` / `--dump-dom` can hang after writing its output.** Run it in the background with its own `--user-data-dir`, wait for the file, then kill it (`scripts/still.sh`).
- **Outside video in the page:** seeking a `<video>` element in headless Chrome isn't frame accurate. Convert it to an image sequence (`references/hybrid.md`).
- **Splines round corners.** A rectangle through Catmull-Rom becomes a pillow; draw straight edges as separate strokes crossing at the corners, or densify the polygon first.
- **Camera clamps** keep the frame from showing past the edge of the world, but they can silently move framings. Log or visualise them.
- **Long renders:** run them in the background and wait on a condition, not a sleep, so you can keep reviewing finished segments while the rest render.
