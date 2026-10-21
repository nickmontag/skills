# Woodcut / linocut

Print processes. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** relief block. The artist cuts away everything that should be white, and the rest prints.
- **Look for:**
  - Light only exists where the block was cut.
  - Big black masses carved with white gouge lines.
  - Lines taper to points and follow form.
  - Wobbly hand-cut edges, and a rough block edge with a frame line.
  - Linocut is smoother. Woodcut adds grain streaks in solids and splintery cuts.
- **In code:** build the scene from SDFs and heightfields, then fill each region with
  `carve(phase_of_region, value)`:
  - Sky: horizontal lines.
  - Swells: lines following each crest.
  - Lamplight: rings, bending over forms by adding the surface height to the distance.
- **Lessons from the fisherman print:**
  - A white line carved just inside a silhouette reads as an outline drawing or a skeleton. Keep silhouettes
    solid and add only a few tapered gouges (belt, hatband, folds).
  - Carve a white halo gap (6–8 px) wherever a black shape meets a dark field.
  - Reflections look right when the second color fills the carved lines. Solid color wedges look wrong.
