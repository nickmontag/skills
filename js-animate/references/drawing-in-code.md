# Drawing by hand, in code

Lessons from building illustrated characters and scenes as authored stroke data (no image generation, no
tracing), then animating them. The examples are illustrations; the principles are what transfer.

## 1. Don't trace the reference

Deriving the drawing from a photo (edge detection, tone separation, halftoning the pixels) always reads as a
**filter**, however much you tune it: every line sits exactly where the photo says. People ask for "more
stylized" and mean "have a point of view".

- Use the reference only for **placement and gesture**. Look at it, then type coordinates.
- Give each character **one exaggerated signature idea** and keep everything else simple: a craning neck and a
  leading nose; wide eyes under a slammed-down brow; closed-eye bliss. Caricature is choosing what to push.
- Coordinates-as-data naturally pushes toward few, confident strokes. Lean into it; fussy detail looks worse.
- If a traced version already exists, keep it as a separate template; don't try to evolve it into a drawing.

## 2. A small drawing vocabulary

Characters get fast to author once every mark is one of a handful of item kinds in plain arrays:

| kind | what it draws |
|---|---|
| stroke | Catmull-Rom through a few points → a filled ribbon: taper in/out, pressure profile (heavy start/end), width noise, overshoot past the ends, optional "dry brush" (several bristles running out of ink at different points) |
| blob | a closed shape: flat fill or halftone clipped to it, with an **offset** so washes miss the line on purpose |
| hatch lines | scanlines across a polygon at an angle and gap, each over/undershooting the edge; `pattern` offsets make bands (plaid = wide bands one way + pinstripe triplets the other) |
| dabs | scattered flecks in ellipses (stubble, texture, lace) |
| knock | erase everything drawn so far under a shape (occlusion; see SKILL §1) |
| text | per-letter placed glyphs; `fill` / `outline` / `knock` modes sharing one jitter seed |

Rules that made it work:
- **Give items an explicit kind.** Detecting kind by property presence breaks the day a new kind reuses a
  name (a text item's outline `stroke` width was taken for a stroke item's points and crashed the render).
- **Wobble the control points, not the pixels.** A low-frequency noise offset per point, keyed on the item's
  seed and the boil drawing, keeps lines coherent while they breathe. 3 drawings at 8 fps reads as hand-made.
  Clean looks (cel, TV, anime, vector) use no wobble at all: a still character is perfectly still.
- **Hand-made and print looks: offset colour washes from the line** (10–20 px). Exact registration looks
  sterile there; a sliver of paper between line and fill reads as hand-coloured. Clean looks do the opposite:
  the fill runs under the line and the line hides the seam (§3).
- **Splines round everything.** Rectangles (windows, buildings) drawn as one closed Catmull-Rom become TV screens
  and pillows. Draw straight edges as separate strokes that cross at the corners, and densify polygon edges
  before splining a fill.
- **Line weight = depth.** Hairlines for the background, medium for the mid-ground, heaviest for the foreground.
  It does more for depth than blur or scale.

## 3. Print and cartoon looks in plain Canvas 2D

**Clean cartoon (cel, TV, anime, flat vector).** The drawing vocabulary above still applies; what changes is
how marks are finished:
- **Fill, then line, per part, back to front.** A part's own fill never covers its line, and nearer parts hide
  the lines of the parts behind them (an arm in front of the body hides the body's outline). Fills extend to
  the line's centre, so there's no gap.
- **Constant width with round caps and joins** (`lineCap = lineJoin = 'round'`) for TV and vector looks; a slight
  taper for classic ink-and-paint. Keep lines at least 2 px at 1080p, or they shimmer when they move.
- **A heavier silhouette.** The outer outline is thicker than the inner lines. Stroke each part at about twice
  the line width in line colour on a pass beneath all the fills; the fills then cover the inner half, leaving a
  thick outside edge.
- **Coloured lines** (a darker tone of the fill instead of black) for soft things: cheeks, hair strands inside a
  shape, fire, smoke, water. It's a classic cel trick.
- **Shadow and rim light as crescents.** A flat-shaded form's shadow is the shape minus itself shifted toward
  the light. That's how anime and TV shading reads, and it takes no 3D:

```js
// src/kit.js: fill the part of `shape` (a Path2D) NOT covered by the same shape shifted by (dx, dy).
// Shadow: shift toward the light, so the crescent lands on the far side. Rim light: shift away from it.
crescent(ctx, shape, dx, dy, color)     // the scaffold's walker and star use it
```

  Two crescents at different depths give a three-tone look. It suits round-ish parts. For hair, cloth folds
  and faces, author the shadow shapes as drawings, the way studios do.
  When a part rotates in a rig, convert the light direction into the part's space (rotate it by minus the
  part's world angle), or the shadow turns with the arm.
- **Contact shadows ground everything.** Put a soft dark ellipse under each foot or object. It shrinks and fades
  as the object leaves the ground; without it, characters float.
- **Soft 2.5D shading** (painterly features, stop-motion): a radial gradient offset toward the light, a bounce
  tint on the shadow-side edge (a crescent in a warm or cool mid-tone), and a darker occlusion where parts meet.

**Print (riso, screenprint).** When a WebGL compositor is overkill, a riso/screenprint look is a few Canvas 2D
moves:
- Draw each ink **plate** in black on its own canvas, then recolour it in one step
  (`globalCompositeOperation = 'source-in'` + `fillRect(inkColour)`). Same-ink overlaps then don't darken, as on a
  real press, and anything you add later (lettering, props) picks up the ink for free.
- Composite plates onto paper with `multiply`, each with its own small offset/rotation (misregistration).
- Ink wear: `destination-out` a blurred low-frequency noise + sparse specks, a different crop per plate.
- Paper grain: one static noise canvas multiplied on top. Keep it still (see SKILL §2 on bitrate).

## 4. Study first, then place

Draw one character's key feature (usually the head) as a **study on its own sheet**, get a yes, then pull the
study into the scene with a transform (offset + scale; scale stroke widths, gaps and offsets by roughly the same
factor, never the halftone cell). The other characters are drawn to match the approved study. This is §4 of
SKILL.md applied to a single character, and it was the turn where the person said "perfect".

## 5. Animating drawn characters

Rigs, IK, walk cycles, follow-through, smears and effects are in `motion-craft.md`. These are lessons specific to
drawn characters.

- **Confirm blocking before building motion.** Who moves toward / away from camera, which way each person faces
  at the start, what triggers each reaction. A "drawing itself on" reveal was rejected outright; people want the
  story acted out. Write the blocking as one line per character at the top of the timeline file.
- **Walking in perspective:** scale a person about the vanishing point (or an anchor near it). Heads of
  same-height people stay near the horizon; that's correct. People cropped by the frame edge need their
  **off-frame body drawn** (legs, hem, hands) for the moments they're farther away and the crop reveals more.
- **Check overlap when people pass in depth.** Draw order is fixed, so if a farther person is drawn over a nearer
  one they must not touch; steer the path, or sort layers by depth per frame.
- **Turns are drawing swaps, twists are interpolations.**
  - A head turning from back-of-head to 3/4 needs real drawings: back → lost profile (nose tip just breaking
    the cheek, ear moving toward centre, smear lines) → final. Swap on twos, a few frames each.
  - A torso twist can **interpolate matched shapes**: author the start and end outlines with the same number of
    points in corresponding order, lerp them, and regenerate fills/hatching from the lerped shape (hatch angle
    lerps too). At the end, hand over to the authored final drawing.
  - **Overlapping action:** the head leads, shoulders follow ~0.05–0.1 s later; a small anticipation dip
    before, overshoot-and-settle after.
- **A reaction reads better as a swap + jolt** than as a slow morph: calm face → shocked face with a small hop,
  then accents (anger marks, steam, sweat) pop in with an ease-out-back scale.
- **Hide, don't remove.** Toggling items with a `hidden` flag (seed assigned before the skip) keeps everyone
  else's wobble stable. Append animation-only drawings (other poses, off-frame body parts) **after** the scene
  so they never shift the finished scene's item order. Better still, key seeds on stable ids (SKILL §7).

## 6. When the animation lands on an approved still

- Make `sceneAt(t >= end)` return the **exact** static scene object, and design every motion to be at rest
  (offset 0, scale 1, bob at a zero crossing) by the last frame, so the handover is invisible.
- After any change to shared drawing code, **pixel-diff the still** against the approved render:
  `render.mjs --stills=T --out=out/tmp --compare=refs/approved.png` prints "identical" or how many pixels changed, and
  writes a diff image. "Looks the same" isn't enough when the still is the deliverable. `shots.json` freezes the
  approved file by hash, so `checks.mjs` also fails if the approved file itself is overwritten.
- **Commit before animating**, and keep the blank scene a template: captions and variants are optional layers
  selected by URL (`?meme=name`), never edits to the scene.

## 7. Captions pinned to characters

Labels that must "stay on" a moving person:
- Declare which person each caption belongs to (`on: 'gf'`); caption items join that person's layer so they
  inherit every transform, but are **drawn last**, over everything.
- **Never grow past the finished size** (cap the text scale at 1 when the person comes closer than final).
- **Resolve collisions** (push overlapping caption blocks apart sideways), **then clamp into the frame** with a
  margin. Run both every frame. Neither should trigger on the final frame.
- In a print style, paper-coloured letters knocked out of every plate, an outline in the key ink and an offset
  shadow in the second ink keep text legible on any background. In a clean style, a solid bubble or tag with the
  same outline as the characters does the job.

## 8. Rendering without Node

If `render.mjs` / puppeteer isn't available, plain Chrome works, with care:
- `--headless=new --screenshot=out.png --window-size=W,H --virtual-time-budget=N URL` for stills; give each run
  its own `--user-data-dir`. **Chrome can hang after writing the file**: start it in the background, wait until
  the file exists and is non-empty, then kill it (`scripts/still.sh`).
- For a whole sequence without a process per frame: render every frame in the page to JPEG data URLs inside a
  `<textarea>`, run `--dump-dom`, wait for `</html>` in the output, kill Chrome, and decode the frames.
- The scaffold's page already has `?raw` (canvas only, 1:1, no chrome) and `?t=` for single moments:
  `tools/still.sh "file:///…/index.html?raw&t=2.5" out.png`. Label contact sheet tiles with their time (`drawtext`).
- x264 refuses odd dimensions: crop to even (`crop=trunc(iw/2)*2:trunc(ih/2)*2`) before `format=yuv420p`.
- GIFs of full-frame texture are big (≈20 MB for 5 s at 900 px). Ship an MP4 alongside, and keep GIFs short or
  narrow. A 3-drawing boil loop of a still is a cheap, charming GIF.
