# Screenprint (serigraphy)

Print processes. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** ink pushed through a mesh stencil.
- **Look for:**
  - Flat opaque inks that can print light over dark.
  - 3–6 colors, bold shapes.
  - Slight misregistration and small "trap" overlaps where colors meet.
  - Occasional ink starvation: a streaky edge on one side.
- **In code:**
  - Flat layers composited with *normal* (opaque) blending, not multiply.
  - A 1–3 px trap between shapes.
  - One or two directional streak masks.
- Gig and Mondo posters live here.
