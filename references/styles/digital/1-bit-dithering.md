# 1-bit dithering (*Return of the Obra Dinn*, early Mac art)

Digital-native. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Look for:**
  - Only two colors (often a tinted pair).
  - Ordered Bayer or blue-noise patterns faking tone.
  - Crisp edges kept as lines.
- **In code:**
  - Threshold the value against a Bayer matrix or blue-noise texture *fixed in screen space*.
  - Draw edges as a separate 1 px line pass so forms stay readable.
- **In motion:** screen-space dither avoids "swimming". World-space dither crawls. Pick one deliberately.
