# Pixel art (8- and 16-bit games, *Celeste*, *Owlboy*)

Digital-native. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** a small grid of hand-placed pixels, scaled up.
- **Look for:**
  - Square, uniform pixels and a limited palette.
  - No anti-aliasing, or anti-aliasing placed by hand.
  - One-pixel outlines, dithered gradients.
  - Sprites with few frames: 4–8 for a walk.
- **In code:**
  - Render at the art resolution (e.g. 320×180) on integer coordinates, then scale up by a whole number with
    `imageSmoothingEnabled = false`.
  - Canvas anti-aliases every shape it draws. For crisp pixels, threshold the low-res layer's alpha, or draw
    with `fillRect` per pixel.
  - Use an even scale factor (1920 / 320 = 6), so every art pixel covers whole 2×2 blocks of yuv420 chroma. An
    odd factor bleeds color into neighboring pixels.
  - Encode at a lower CRF than usual: hard pixel edges are expensive to compress.
- **In motion:** sprites at 8–12 fps. The camera either snaps to whole art pixels (authentic) or glides
  (modern); pick one.
