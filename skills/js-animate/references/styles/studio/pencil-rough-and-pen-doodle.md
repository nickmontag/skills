# Pencil rough and pen doodle (animation roughs, sketchbooks, ballpoint)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** the drawing before clean-up: graphite or pen lines with the construction left in.
- **Look for:**
  - Pencil: several searching strokes per edge, pressure variation, blue or red construction under the
    graphite, smudges.
  - Ballpoint: a thin, even line, blobs where the pen starts or stops, looping scribble-hatch shading, lines
    pressed into the paper, often on ruled paper.
  - Line boil on twos.
- **In code:**
  - Each edge is 2–3 strokes with their own seeds and small offsets, over lighter construction strokes.
  - Ballpoint ink runs lighter on fast strokes and pools where the pen slows, with a dot of excess ink at
    stroke starts.
- **In motion:** boil on twos (`references/drawing-in-code.md` §2).
