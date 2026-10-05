# Storybook watercolor and gouache (picture books, *The Gruffalo*, Ghibli backgrounds)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** transparent washes (watercolor) or opaque matte paint (gouache) on textured paper.
- **Look for:**
  - Watercolor: pigment pooling darker at the edge of each wash, granulation, blooms, and white paper as the
    highlight.
  - Color that bleeds past the pencil or ink line.
  - Gouache: flat matte color with soft brush edges, light painted over dark.
- **In code:**
  - A wash is the shape's mask with a noise-displaced edge. Edge darkening is the mask minus its blur (the
    positive ring), added as extra pigment. Granulation is fine noise multiplied in, stronger in dark pigments.
  - Composite watercolor washes with `multiply` and gouache with normal blending.
  - The line layer sits on top, offset from the washes.
- **In motion:** gentle, with backgrounds still. Repainting washes every frame boils badly; fix each wash's
  texture to its part.
