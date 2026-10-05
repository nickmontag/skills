# Shared machinery

The parts every look in the style library is built from. The index is `references/styles/README.md`.

**Cartoon and animation looks** (§2) share one kit, covered elsewhere:
- Drawing: fill then line, a heavier silhouette, colored lines, crescent shadows and rim lights, contact
  shadows, soft 2.5D shading. All in `references/drawing-in-code.md` §3.
- Motion: rigs, cycles, follow-through, smears and blur, effects, multiplane camera, motion-graphics primitives.
  All in `references/motion-craft.md`.
- Clean looks drop the print habits below: no wobble, no misregistration, no paper, pure white allowed.

**Print looks** are built from the same few parts:
- **Separations.** Each ink is its own boolean or coverage layer. Composite them by multiplying onto paper,
  in press order, with the black key last.
- **Registration slip.** Offset each color layer by 1–4 px. The slip should be the same across a still, and
  drift a little from frame to frame in motion.
- **Paper.** Warm off-white (never `#fff`), low-frequency fiber noise, a faint vignette.
- **Ink texture.** Punch holes in the ink where fine noise passes a threshold (the paper's tooth). Modulate
  that threshold with a large mottle field, so ink runs light in patches. Keep it subtle on black
  (≈3–5 % holes) and heavier on color (≈6–12 %). Too much reads as a noise filter.
- **Tone as line.** `carve(phase, t) = 2·|frac(phase) − 0.5| < t` gives lines whose black width is the
  fraction `t` of each period. Choosing `phase` sets the line direction:
  - `y / gap` for horizontal lines
  - distance-to-light for rings
  - `−sdf / gap` for contour-parallel lines
  - angle for rays

  `t` is the value. Where `t` varies smoothly, lines taper to points by themselves.
- **Hand wobble.** Add low-frequency noise to every phase and SDF (±1–3 px). In a print look, ruler-perfect
  edges read as vector art.
- **Supersample** at 2× and downsample with Lanczos. It's cheaper than analytic antialiasing and hides
  aliasing in fine line fields.

A worked example of all of this is `~/Design/AI/linocut/`:
- `lino_kit.py`: the SDF kit, `carve`, and the press.
- `linocut.py`: the fisherman print.
