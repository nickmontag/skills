# Review checklist (every pass, before anyone else sees it)

Two halves. The first is commands: run them and fix what they report. The second is judgment: look at images, at
thumbnail size and full size, because the checks only know what the scenes told them. `references/checks-and-pace.md`
explains every tool.

## 1. Run

- [ ] `npm test`: the kit's maths still holds.
- [ ] `npm run probe && npm run check`: 0 errors. Read every warning, and either fix it or declare the exception in
      the scene (`mark.plan`, `{ within }`, a tempo) so the next run is quiet. Read the pace table: is every scene's
      sustained speed where you'd want it, not just under its limit?
- [ ] `node tools/checks.mjs --only=gate`: nothing builds on an unapproved item, and no approved file has changed.
- [ ] `npm run video && npm run metrics`: 0 unplanned black, flat, flash or glitch frames. Freezes are deliberate.
      The bitrate is sane for the platform (a spike means something changes every pixel every frame).
- [ ] The render's own summary: codec, yuv420p, TV range, BT.709, frame count and duration (video and audio end
      together), decodes cleanly. Audio silent in the pre-roll and starting where it should.
- [ ] After any change to shared drawing code: `render.mjs --stills=T --compare=approved.png` for every approved
      still (identical, or a diff image to show the person).
- [ ] Every note from the last round has a rule in `rules.mjs` (named in `RULES.md`) that failed before the fix and
      passes now, or a written reason it can only be judged by eye.

## 2. Look

**The whole film:** `npm run sheet` (a frame every 1.5–3 s; `--sheet=all:N`).
- [ ] Every frame reads at thumbnail size: one clear subject, a strong light and dark shape.
- [ ] The first 2 seconds hook on their own, with the sound off (feeds autoplay muted). The strongest frame is
      picked as the poster or thumbnail.
- [ ] The main character is on screen and performing for most of it; cutaways are short.
- [ ] One style: colours only in their assigned roles, one lettering treatment (plus deliberate exceptions),
      nothing that looks like a different video.

**Every key moment** (hits, transitions, reveals, the ending): `--strip` across it (about 1 s either side).
- [ ] Anticipation, action, follow-through and settle, big enough to read.
- [ ] It lands on the right word or beat. Important beats have room to breathe: a hold, a silence.
- [ ] Nothing covers the thing the shot is about (a face, the key prop, the word being sung).

**Motion** (`--trails` and `--onion` over every walk, fast move and effect):
- [ ] Planted feet pile up on one spot; knees and elbows bend the right way all the way through.
- [ ] Cycles close: phase 1 matches phase 0, with no hitch at the wrap.
- [ ] Living things move on arcs; spacing is eased where moves start and stop; overlapping parts don't start and
      stop together.
- [ ] Fast moves are treated to suit the look: smears, stretch or blur, never stepped copies.
- [ ] Characters on twos, camera on ones; hits land on a new drawing.
- [ ] Rig joints never open a gap; cel shadows stay on the side away from the light as parts rotate.

**Characters and staging:**
- [ ] Each character reads from one pushed idea at thumbnail size; nothing looks traced or filtered.
- [ ] Blocking matches what was agreed: who moves toward or away from camera, which way each faces at the start,
      what triggers each reaction. Walking away means back to us.
- [ ] People passing in depth overlap in the right order; off-frame body parts exist wherever the crop can reveal
      them; bodies and poses read (lying down reads as lying down; covered stays a shape).
- [ ] Labels on moving characters stay on them, inside the frame, apart from each other.

**Light and occlusion:**
- [ ] For every shadow, where is the light? Direction and size consistent; one job per light per shot. If the
      visible source contradicts the angle, move it off frame.
- [ ] Nothing is see-through that shouldn't be; knockouts cover every layer; fading objects fade their knockout too.

**Invariants:**
- [ ] If the animation lands on an approved still, the last frame hands over invisibly (compare it).
- [ ] The blank template still renders without any optional layer (captions, variants).
