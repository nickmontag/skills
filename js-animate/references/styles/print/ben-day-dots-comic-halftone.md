# Ben-Day dots / comic halftone

Print processes. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** the pulp comic's cheap tint. Evenly spaced dots of one ink, next to flat color.
- **Look for:**
  - Uniform dots (true Ben-Day), or dots that grow with tone (halftone).
  - Heavy black inks, slightly off-register color.
  - Yellowed newsprint.
- **In code:** a dot grid in a rotated frame. `dist(p, nearest cell centre) < r(tone)`. Use a separate
  screen angle per ink (C 15°, M 75°, Y 0°, K 45°).
- **In motion:** hold the dot grid still in screen space while shapes move under it. It sells the "printed
  page".
