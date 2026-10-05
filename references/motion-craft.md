# Motion craft: making things move like animation

The look is in `references/styles/README.md`. This file is about how things move, whatever the look, and it's what most
separates "animated" from "shapes sliding around". Every function here is a pure function of time, so it works with
scrubbing, parallel segments and re-rendering one shot (SKILL §1). The code lives in `src/kit.js` of the project
scaffold (`assets/project/`), tested by `npm test`; this file explains when and how to use it, with the signatures.
Add new helpers to the kit (with a test) rather than re-typing them in scenes.

## 1. Timing and spacing

Timing is how long a move takes. Spacing is where the in-between positions fall. Code-drawn animation looks
mechanical for two reasons: linear spacing, and everything starting and stopping together.

```js
// src/kit.js
E.inC  E.outC  E.inOut  E.outExpo  E.outBack(x, s = 1.7)   // one easing family per piece (a "motion language")
ease(x)  easeOut(x)  kf(t, [[t0, v0], [t1, v1], …], easing) // keyframes, numbers or arrays
spring(tau, f = 3, zeta = .4)             // underdamped step 0 → 1 from tau = 0: overshoots, settles
springKeys(t, [[t0, v0], [t1, v1], …], f, zeta)             // every key change is a spring step; steps superpose,
                                                             // so a new key can interrupt a move still settling
twos(t)  drawNo(t)                        // characters on twos: feed them twos(t); keep the camera on t
```

- **Ease everything that starts or stops.** Things move linearly only when they're already moving (a drift, a
  conveyor, a scrolling background).
- **Anticipation → action → overshoot → settle.** A small move the opposite way first (10–20 % of the distance,
  3–6 frames), a fast action, then `outBack` or `springKeys` for the overshoot. Lower `zeta` gives a cartoonier,
  bouncier landing.
- **Overlap.** Nothing starts or stops together. Offset parts by 2–4 frames: the head leads, the body follows, the
  hands arrive last.
- **Ones and twos.** Characters on twos (`twos(t)`) read as hand-animated. Fast action goes on ones. Camera moves
  always go on ones, or they judder. Snap key hits to the drawing grid so a hit lands on a new drawing.
- **Holds.** Hold key poses for at least 6–8 frames so they register. A character frozen for more than about a
  second reads as dead, so use a *moving hold*: breath (a 1–2 % chest scale at about 0.25 Hz), a drift toward the
  next pose, and blinks.
- **Arcs.** Living things move on arcs. A rig gives arcs for free (joints rotate). A free-moving object tweened in
  x/y travels in a straight line, so route it through a curve instead:

```js
// src/kit.js
arc(a, b, k, bulge = .25)                 // a point k of the way from a to b along a bowed curve (> 0 one side, < 0 the other)
blink(t, seed = 0, every = 3.2)           // one blink per slot at a seeded moment, 5 frames long: 0 open … 1 shut
hop(t, t0, t1, h)                         // anticipation, stretch, squash on landing, settle: { dy, sq }
fallTime(h)  fallen(s)                    // real gravity: seconds to fall h metres, metres fallen after s seconds
```

## 2. Rigs: puppets with pivots

Most character animation in code is a cutout rig: parts drawn once, each rotating about a joint on its parent.
It's how TV animation (Toon Boom, Moho, Rive, Spine) works, and it suits every look from UPA to anime.

```js
// src/kit.js: 2D affine matrices as [a, b, c, d, e, f], the order ctx.setTransform / ctx.transform take
mul(m, n)  TR(x, y, r = 0, s = 1)  apply(m, x, y)  angleOf(m)
pose2world(rig, pose, root)   // rig: { bone: [parent, pivotX, pivotY] } (pivot in the parent's space; bones point down
                              // (+y) at angle 0); pose: { bone: radians } → every bone's world matrix
ik2(S, T, a, b, bend = 1)     // two-bone IK: world angles (from +x) of the upper and lower bone reaching from S toward T.
                              // With the limb pointing down, bend = 1 puts the middle joint on the +x side (knees of a
                              // character facing +x); -1 for elbows; flip both when the character faces -x.
// ik2 → pose angles: upper = t1 - PI/2 - angleOf(M[parent]); lower = t2 - t1
```

- **Draw order is separate from the hierarchy.** Keep a list like `['armFar', 'legFar', 'torso', 'head',
  'legNear', 'armNear']`, then for each bone `ctx.save(); ctx.transform(...M[bone]); drawPart(ctx); ctx.restore()`.
  The far arm is a child of the torso but is drawn behind it.
- **Hide the joints.** Parts overlap at each pivot, with round ends centred on it, so rotating never opens a gap.
  Clean looks need a joint cap: the child's round end drawn over the parent.
- **Swaps, not morphs, for things that change shape.** Hands (open, fist, point), mouths (SKILL §5), eyes and
  head turns are sets of drawings chosen by key (`drawing-in-code.md` §5).
- **IK for contact.** Feet on the ground and hands on props use `ik2`. Everything else is rotated directly
  (forward kinematics), which is easier to act with.
- **Props ride on bones.** A held cup is drawn with `M.handR` times its own offset. Captions pinned to a character
  work the same way (`drawing-in-code.md` §7).
- **No non-uniform scale on a parent bone**, or its children skew. Squash and stretch the part's drawing
  (the leaf), not the bone.

## 3. Cycles: walks, runs, idles

A cycle is a function of phase, and phase is a function of time. Feet stay planted because the maths plants
them, not because someone tuned it.

```js
// src/kit.js: hip and feet for a walk (or run) along +x at `speed` px/s. D = the fraction of the cycle each foot is
// down (walk ≈ .6, run ≈ .35); stride = distance per full cycle (two steps). Tested: planted feet never move.
gait(t, { x0, ground, speed, stride, D, lift, hipH, bob }) → { c, hip: [x, y], feet: [[x, y], [x, y]] }
// legs: S = hip (± a little x for near / far), T = foot minus ankle height, then ik2(S, T, thigh, shin, 1)
// arms counter-swing; the arm on foot i's side is back when that foot plants: swing * Math.cos(TAU * (c + i / 2 - .05))
// src/cast/walker.js in the scaffold puts all of this together.
```

- **Speed = stride × cadence**, or the feet slide. If the camera tracks the character, scroll the ground at
  exactly `speed`.
- **The hip must stay low enough** for the leg to reach its front plant. If the knee snaps straight at contact,
  lower `hipH` or shorten the stride.
- **Weight:** the body is lowest just after contact (the "down"), a heel strike tips the foot up, the toe pushes
  off at the end of stance. The head bobs a little behind the hip (§4).
- **Character in the walk:** a sneak has a long D, a low hip and big lifts. A march has no bob and straight arms.
  A tired walk has a small lift, a late drag and a head that sags. Push one of these per character (SKILL §5).
- **Runs** have a flight phase (D < .5), a forward lean, a bigger bob with the opposite sign, and arms bent at
  about 90°.
- **Loops must close.** A cycle's frame at phase 0 and phase 1 must match. Check a strip across the wrap
  (`render.mjs --strip=a:b`), and `--trails` over a full cycle: planted feet show as dots piled on one spot.
- **Idles** mix two or three incommensurate slow motions (breath, a sway, a weight shift). A single sine on
  everything looks like a screensaver.

## 4. Follow-through and secondary motion

Hair, capes, tails, ears, antennae, straps and bellies keep moving after the body stops.

```js
// src/kit.js: spring-follow any driver function by replaying a short fixed-step window that ends at t. Still pure: the
// steps sit on an absolute time grid, so neighbouring frames agree. The window must cover the settle time,
// about 5 / (zeta * TAU * f) seconds.
follow(driver, t, f = 2, zeta = .3, win = 1.5, dt = 1 / 240)
```

- **Chains** (a tail, a cape edge, a ponytail): link i follows the driver later and weaker, e.g.
  `angle_i = driver(t - i * lag) * .8 ** i`, or `follow` with lower `f` down the chain. Draw the chain as one
  spline through the joint positions, not as separate sticks.
- **The body settles too.** After a stop, the torso overshoots and the head lags (`follow` on their angles).
- **Secondary motion supports the primary action.** If the cape draws the eye away from the face, damp it.

## 5. Fast motion: stretch, smears, blur

Because position is a pure function of time, velocity costs nothing: difference it.

```js
// src/kit.js: position is a pure function of time, so velocity costs nothing
vel(pos, t)                             // [vx, vy] by central difference
stretchAlong(ctx, vx, vy, amount)       // volume-preserving stretch along the motion; amount ≈ clamp(speed * k, 0, .6)
smear(ctx, pos, t, span, n, draw)       // the shape repeated along its recent path, tapering toward the tail. draw(ctx)
                                        // fills it with NO outline (outlined copies read as a stack of coins); draw the
                                        // outlined shape once, on top, at pos(t)
blurredFrame(t, K, frameAt, src, acc)   // 180° shutter: average K sub-frames across the half-frame centred on t.
                                        // frameAt(ts) draws a complete opaque frame into the canvas src; acc receives it
```

**Which one depends on the look:**
- **Cel, TV, rubber hose:** stretch, then 1–2 smear frames at the fastest point, sometimes multiples (extra
  limbs). No blur; blur reads as CG.
- **Anime:** speed lines behind a held pose, smears, and impact frames (§6).
- **Stop-motion:** none. Hard strobing is part of the look.
- **3D-ish, painterly and motion graphics, and all fast camera moves:** 180° blur.

**Using `blurredFrame`:**
- Pick K from speed: about one sub-frame per 3 px of blur length (`K ≈ ceil(pxPerFrame * .5 / 3)`, capped at
  ~16). Use K = 1 when nothing moves fast. It multiplies render time by K, so turn it on per shot.
- Too few sub-frames show as stepped copies, not blur.
- For one transparent layer, accumulate with `globalCompositeOperation = 'lighter'` at `globalAlpha = 1 / K`
  instead. Source-over is wrong there: transparent sub-frames don't pull the average toward transparent. Expect
  about ±K/2 levels of rounding, or accumulate in a WebGL float target.
- For smears, choose `n` so the copies overlap (spacing smaller than the shape), and use them only on frames
  above a speed threshold. In a cel look the smear takes the fill colour, or a lighter tint of it, with no line.

## 6. Hits and effects

```js
// src/kit.js
shake(t, hits, amp = 24, decay = 6, freq = 18)   // [dx, dy, rotation] from a list of hit times; squared, so small hits
                                                 // stay subtle and big ones violent
hitStop(t, hits, hold = 3 / 24)                  // time that freezes for `hold` at each hit; author post-hit keys in it
particles(t, { rate, life, from, to, seed }, each)   // closed-form particles on a fixed grid of emission slots:
                                                 // each(r, age, k, i) with the particle's own rng r and k = age / life
// sparks: particles(t, { rate: 200, life: .6, from: hit, to: hit + .05 }, (r, age, k) => {
//   const a = r() * TAU, v = 400 + 600 * r(); dot(x0 + Math.cos(a) * v * age, y0 + Math.sin(a) * v * age + 900 * age * age, 3 * (1 - k)); });
```

- **Anatomy of a hit:**
  - The hit itself: hit-stop (2–4 frames) and one flash or impact frame (white, inverted, or flat black and one
    colour).
  - Then an expanding ring (`outExpo` radius, thinning line), radial speed lines, sparks or debris, and a
    `shake`.
  - All of it keyed to the audio onset.
- **Particles:** call the `rng` in the same order every time, and randomise per-particle life inside `each`
  (skip when `age > life * r()`).
- **Fire:**
  - Classic hand-drawn fire is a loop of shapes on twos. Tongues rise, pinch off at the top and shrink; they
    don't fade.
  - Build it from particles with upward acceleration and shrinking teardrops, coloured by age: white-yellow, then
    orange, then red.
  - Cel looks use three flat tiers (each tier the union of its tongues). Glowing looks use `'lighter'`.
- **Smoke:**
  - Puffs grow (r ∝ √age), slow down (ease-out drift), rise and lean with the wind.
  - Cel smoke is flat two-tone puffs that break up by erosion (growing knock-out holes), not by fading.
- **Energy and beams:**
  - A white core, a colour glow (wider strokes at lower alpha on `'lighter'`, or `shadowBlur`), and a width that
    flickers per drawing (`noise(twos(t) * 12)`).
  - Charge-ups run particles in reverse, converging on the source.
- **Water:** ballistic drops with a stretch along velocity, a splash crown of particles, and flat ripple rings
  that ease out.

## 7. Camera

```js
// src/kit.js: multiplane. c = { x, y, dolly, zoom }; d = a plane's distance (1 = the action plane, 3 = far hills,
// .5 = foreground). Author each plane at its on-screen size for the resting camera; skip planes the dolly has passed.
plane(ctx, c, d)
// The scaffold's cam(x, y, zoom, rot) in src/studio.js is the simple one-plane camera every layer shares.
```

- **Zooms don't make parallax; trucks and dollies do.** A zoom scales every plane equally (it looks flat, like
  scanning a painting). A dolly scales near planes faster than far ones (it feels like moving through the space).
  Choose deliberately.
- **Ease into and out of every move.** Track a moving subject with lag (`follow` on the camera x), and leave
  more room in front of it than behind.
- **Handheld** is low-frequency noise (0.3–1 Hz, a few px). Shake (§6) is for hits only.
- **Whip pans** move fast with blur or speed lines and cut inside the blur. It's the cartoon and anime
  transition.
- **Rack focus:** pre-blur static planes once and cross-fade to a sharper copy. Don't run `ctx.filter = 'blur()'`
  per frame on big layers (SKILL §2, performance).

## 8. Motion-graphics primitives

```js
// src/kit.js
trim(ctx, pts, k0, k1)        // stroke only the part of a polyline between fractions k0 and k1 of its length
morphPair(A, B, n = 128)      // resample both outlines by arc length, match winding and start point (memoize: not per frame)
morph(pair, k)                // the outline k of the way from A to B;  resample(pts, n) and area(P) are there too
letters(ctx, text, x, y, each)   // per-letter animation that keeps the font's kerning: each(i, n) sets that letter's
                                 // transform and alpha on ctx (src/scenes/02-title.js uses it)
```

- **SVG paths:** measure with a detached `<path>` element (`getTotalLength()`), stroke with `new Path2D(d)`
  under the same dash. Canvas restarts the dash on every subpath, so trim one subpath at a time.
- **Stagger:** item i starts `i * gap` later (`seg(t, t0 + i * gap, t0 + i * gap + dur)`). 2–4 frames of gap
  reads as one gesture; more reads as a list.
- **Masks and wipes:** `ctx.clip()` with an animated shape, or a matte canvas composited with `'destination-in'`.
- **Match cuts:** morph the last shape of one idea into the first shape of the next instead of cutting.

**The motion language that makes motion graphics feel designed:**
- Entrances ease out (fast in, long settle). Exits ease in and are quicker than entrances.
- Overshoot is sparing and the same size everywhere.
- Every move overlaps the next.
- Nothing moves linearly except continuous drifts.
- One easing family for the whole piece.
