# Risograph

Print processes. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** soy-ink stencil printing, one drum per color.
- **Look for:** fluorescent pink, teal, yellow and blue with transparent overprints. Grainy, uneven
  coverage. Visible misregistration, coarse halftone, and roller marks at the edges.
- **In code:**
  - 2–3 inks with multiply compositing.
  - Halftone each ink at a different screen angle.
  - Per-ink density noise, and a 2–5 px slip.
  - Faint drum banding: horizontal density stripes.
- Example: `~/Design/AI/riso-meme/`.
