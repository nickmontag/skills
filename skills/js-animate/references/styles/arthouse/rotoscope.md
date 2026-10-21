# Rotoscope (Ralph Bakshi, *A Scanner Darkly*, *Undone*)

Arthouse animation techniques. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** drawing over live-action footage.
- **Look for:**
  - Uncannily realistic human motion under simplified drawing.
  - Flat tone shapes that shimmer.
  - Contour lines that slide.
- **In code:**
  - Only with real motion data: pose landmarks per frame driving authored shapes.
  - Don't edge-detect the video (SKILL §5).
  - Smooth landmarks lightly and keep some jitter.
