# CRT / VHS artifacts

Digital-native. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Look for:**
  - Scanlines, phosphor bloom, chromatic aberration.
  - Tracking wobble (horizontal line offsets), head-switch noise at the bottom.
  - Soft chroma (color smeared horizontally).
  - Timecode overlays.
- **In code:**
  - Post-pass: per-row x offsets from noise.
  - Blur only chroma horizontally.
  - Additive bloom, scanline multiply, a vignette and slight barrel distortion.
- **In motion:** occasional tracking glitches synced to hits. Constant glitching is noise.
