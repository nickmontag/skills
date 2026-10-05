# Instruments: seeing time, and pace

A model reviews animation by looking at stills. Most of what goes wrong happens in time: too fast, too short, one bad
frame, something appearing before its cause, a rule followed in one scene and broken in the next. On one short film,
most of the person's notes were of this kind ("the pen feels sped up", "too short", "this moves too quickly", "it
flashes to the whole drawing before it's finished", "we see ink before the pen touches the page"), and contact sheets
had missed every one. These tools turn time into numbers and single images.

| Question | Tool |
|---|---|
| Does every rule still hold? Text on time, nothing covered, nothing pops or un-draws, pace inside its limits | `mark.*` in scenes → `render.mjs --probe` → `checks.mjs` |
| Did the encode come out right? No stray, black or grey frames, no freezes, a sane bitrate | `metrics.mjs` |
| How does it move? Spacing, arcs, planted feet | `render.mjs --trails`, `--onion`, `--strip` |
| What's where in this frame? | the page with `?marks` (or the marks box in the studio) |

`npm run review` runs probe, checks, video, metrics and a contact sheet in one go. Run it before showing anyone.

## 1. The probe: scenes say what they draw

`src/studio.js` gives scenes a recorder, `mark`. It costs nothing unless probing, and it reads the context's current
transform, so a box marked inside a rig or under the camera lands in screen pixels.

```js
mark.fillText(L.text, 'w:fine', 'fine', x, y, { onset: word.s })   // draws and marks; the onset is when it's sung
mark.text(ctx, 'title', 'THE END', 0, 40, { onset, read: true, shown: k, within: 1.4 })
mark.box(L.main, 'hero', 'char', x, y, w, h)       // characters and props: anything that could cover text
mark.point(L.main, 'hero.footL', fx, fy)           // points whose motion matters
mark.plan('flash')                                 // intended oddities, so they aren't flagged
mark.state('reveal.page', drawnLength)             // anything a project rule needs
```

- **Text:** mark every piece. Give it an `onset` if it's timed to sound; `read: true` if the audience must read it;
  `shown` (0–1) if it types on; `within` if a deliberate slow reveal takes longer than 0.9 s.
- **Boxes:** every character, every prop that could cover text, and the thing each shot is about.
- **Points:** hips and feet (sliding), hands (arcs), the object of a gag, a pen tip, anything whose speed or path
  someone will judge.
- **Plan:** `black` (dips, fades, deliberate darkness; declare every frame that's mostly dark), `flash`, `still` (a
  deliberate freeze), `whip`, `smear` or `fast` (a planned fast move), `shake`, `cut` (a jump inside a scene),
  `unreveal` (something meant to un-draw). Over-declaring is harmless: planned means allowed, not required.
- **State:** whatever a project rule needs: pen down or up, how much of a drawing is revealed, the frame width in
  millimetres, which pose is showing.

`out/probe.json` has one frame per line, so `grep '"t":3.5'` finds a moment.

## 2. Checks: rules that run

`tools/checks.mjs` runs the built-in rules over the probe, then the project's own rules from `rules.mjs`, then the
approval gates in `shots.json`. Errors exit 1; warnings don't. The header of `checks.mjs` lists the built-ins: text
early, late, outside the safe area, covered, overlapping, too small, too brief to read; single-frame pops; reveals
going backwards; sustained camera and motion speed against the scene's tempo; shot length; the gates. It ends with a
pace table: each scene's sustained maxima next to its limits.

**Turn every note into a rule.** A note written only in prose gets broken again, often by the model that wrote it
down.
1. Put the person's words in `RULES.md`, verbatim, with the date.
2. Decide what data would prove the rule: an existing mark, or a new `mark.state` in the scene.
3. Write the rule in `rules.mjs`, and run it on the version the note was about: it must fail. A rule that passes
   on the broken version tests nothing.
4. Fix the film until it passes everywhere, not just in the frame they pointed at.
5. Name the rule in `RULES.md`.

| The note | What the scene records | The rule |
|---|---|---|
| "we see ink before the pen hits the page" | `state('penDown')`, `state('reveal.ink', length)` | ink length grows only while the pen is down |
| "we can't go that wide, we'd see the hand" | `state('frameMM', width)` while the pen is in shot | frame ≤ 14.5 mm |
| "it flashes to the whole drawing" | `state('shown', fraction of the final drawing)` | shown = 1 only after the drawing's finish time |
| "keep her in the shot" | `box('her', 'char', …)` | her box inside the frame |
| "the words come in early" | `text(…, { onset })` | built in: `text-early` |

## 3. Metrics: the encoded file

`tools/metrics.mjs --video=out/video.mp4 --probe=out/probe.json --graph=out/video.metrics.png` decodes the actual
file and measures every frame. Pass `--start=T` when the video doesn't begin at the start of the timeline.

| It reports | Usual cause |
|---|---|
| **black** or **flat** frame, unplanned | a frame that didn't draw: an exception, an early return, an asset not loaded, a gap between scenes |
| **glitch**: a frame unlike both neighbours | a frame from the wrong scene or time (seam maths, a hand-off between engines), a ghost from one motion-blur sub-frame, a double image where two passes overlap |
| **freeze** longer than a second | a clamp in the timing, or a hold with no life in it (add breath and blinks, SKILL §5) |
| **cut** where no scene starts | a camera jump or a scene boundary off by a frame |
| **bitrate** spike | grain, jitter or texture that changes every pixel every frame (SKILL §2) |

The sparklines give one character per second (motion, bitrate, events), so a whole film's rhythm fits on a screen;
the graph shows luma, motion and bitrate on one timeline with every event marked.

## 4. Seeing motion in one image

- `--strip=a:b` shows every drawing from a to b in a labelled grid. Use it for key moments, hits and transitions.
- `--onion=a:b` averages the frames into one image with the last on top. Spacing shows as ghosts: bunched at the
  ends of an eased move, even in a linear one, jumpy where a frame is missing.
- `--trails=a:b` draws the frame at b with a dot per frame for every tracked point, pinned to the world as seen at b
  (`--screen` for screen positions). Planted feet pile up on one spot; sliding feet smear. Arcs show as curves,
  straight tweens as lines, eases as bunching dots. A ring every 12 dots marks each half second.

Use them at every key moment, every walk and every fast move. The questions they answer ("do the feet slide?", "is
this on an arc?", "is the spacing eased?") can't be answered from a contact sheet.

## 5. Pace

**The bias to correct: models compress time.** A beat that looks fine as data plays like a blink. First drafts come
out too fast and too short. On the film above, pace came back three times before it was right. Draft at the long
end; the person can ask for trims more easily than they can describe what's missing.

- **Real actions play at real speed. To skip time, cut; never speed up.** Magnification multiplies speed on screen:
  a pen at a real 20 mm/s crosses an 11 mm macro frame in about half a second, so the camera tracks the tip or the
  shot cuts. The pen doesn't hurry. (There, 57–320 mm/s read as "sped up"; 14–22 mm/s read as real.)
- **Give each scene a tempo** (`scene(name, { tempo })`), and make them contrast. On that film, everything outside
  the hero's world was tender and slow, with long fades and slow camera moves; only the fights were fast.
- **Hold moments.** Key poses at least 6–8 frames. A reaction needs about 0.5–1 s to register, an establishing shot
  3 s or more, a title card its reading time plus a beat. A silence after a shock can run several seconds.

Default limits (`checks.mjs`; override per film in `rules.mjs`). Speeds are sustained over 0.5 s, so a brief fast
move (a hit, a fall, a whip) passes and a whole move that's too fast doesn't. `cam` is in frame widths per second, so
1 / cam is the seconds something takes to cross the frame.

| tempo | camera pan | zoom | tracked motion | shortest scene |
|---|---|---|---|---|
| still | 0.02 (50 s to cross) | 1 %/s | 0.05 | 2 s |
| tender | 0.08 (12 s) | 3 %/s | 0.25 | 4 s |
| normal | 0.15 (7 s) | 8 %/s | 0.8 | 2 s |
| action | 0.6 (1.7 s) | 30 %/s | 2.5 | 0.75 s |

Reference numbers for real things:
- **Walking:** 1.2–1.5 m/s, about two steps a second. **Running:** 3–6 m/s.
- **Falling:** t = √(2h / g): 0.45 s for 1 m, 0.9 s for 4 m (`fallTime(h)` in the kit). A dropped object that takes
  longer reads as floaty; shorter reads as thrown.
- **A blink:** about 0.1–0.3 s; animated blinks are usually 3–5 frames. **A head turn:** 0.3–0.6 s.
- **Reading:** 1.5 s plus 1 s per 15 characters for captions; a word sung is shown at its onset and stays.
- **Camera:** the cinematographers' rule of thumb is about 7 s for an object to cross the frame at 24 fps without
  strobing; faster needs motion blur, or it becomes a whip pan (`plan('whip')`).
- **Shot length:** recent live-action features average roughly 2–6 s per shot, fights at the short end and quiet
  scenes far longer. Animation drafts almost never err long.
- **Fades:** 1.5–3 s up from black for a tender opening; dissolves 0.5–1.5 s; a hard cut to black for shock.

## 6. What still needs a person

The model can't hear the film or feel its rhythm. Lip sync, whether a hold is too long, whether a hit lands, whether
it's moving: ask the person to watch with sound. Then turn what they say into rules.
