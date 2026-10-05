# Stop-motion and claymation (Aardman, Laika, *Fantastic Mr. Fox*)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** physical puppets moved a little and photographed, one frame at a time.
- **Look for:**
  - Real soft shadows, shallow depth of field, miniature-scale lighting.
  - Clay: fingerprints and tool marks, slightly lumpy forms, surfaces that shift a little between frames.
  - Replacement mouths and eyelids; fabric and fur that crawl where hands touched them.
  - Hard strobing on twos, with no motion blur.
- **In code:**
  - Soft-shaded primitives (radial gradients, height-field lighting) read as clay or toys. That's a problem in
    other looks and the whole point here.
  - Surface boil per drawing: tiny seeded offsets on textures, not on silhouettes.
  - Depth of field from pre-blurred planes, and a contact shadow under everything.
- **In motion:** on twos, with slightly imperfect spacing (±5 % seeded noise on each drawing's progress) and no
  blur. Surface boil costs bitrate (SKILL §2), so keep it small.
