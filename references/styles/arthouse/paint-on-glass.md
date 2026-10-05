# Paint-on-glass (Aleksandr Petrov)

Arthouse animation techniques. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** oil paint on glass, re-smeared for every frame.
- **Look for:**
  - Painterly strokes that flow and morph.
  - Scenes that dissolve into one another.
  - Visible finger and brush texture.
  - Warm luminous backlight.
- **In code:**
  - Keep a persistent canvas.
  - Each frame, advect the previous frame along a flow field.
  - Then add new directional stroke dabs toward the target image.
- **In motion:** transitions are metamorphoses, never cuts.
