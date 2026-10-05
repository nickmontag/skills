# Painterly 2D feature (*Klaus*, *Arcane*, *The Bad Guys*)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** drawn or flat-shaped characters lit like CG: volumetric light on 2D.
- **Look for:**
  - A soft key light with a clear terminator, a colored rim light, bounce light in the shadows.
  - Brush texture in the fills, atmospheric haze and depth.
  - A strong warm/cool split between light and shadow.
- **In code:**
  - Treat each part's silhouette as a height field. Blur its mask, take the gradient of the blur as the
    surface normal, and light it in a fragment shader: a key term from the light direction, plus a rim term at
    the edge on the light side.
  - A brush texture that follows the form and is fixed to the part, so it moves with the part, not the screen.
- **In motion:** full animation. Compute light in world space so it stays put as parts rotate. Motion blur on
  fast moves (`references/motion-craft.md` §5).
