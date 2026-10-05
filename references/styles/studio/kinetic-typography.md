# Kinetic typography (lyric videos, title sequences)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** type as the main character.
- **Look for:**
  - Words that arrive on their sung or spoken onset and move with the voice's energy.
  - Hierarchy by size and weight: the important word is the big one.
  - One or two typefaces, strict alignment, and a camera that travels through a layout of words.
- **In code:**
  - Letters placed with `letters()` (`references/motion-craft.md` §8), or glyph outlines via opentype.js (SKILL §7).
  - Lay the whole lyric out once on a large virtual page, then fly the camera from word to word with eased
    moves.
  - Timing comes from `references/audio-timing.md`, and the automated text check (SKILL §6) is essential.
- **In motion:** each word enters the way it's sung. A held note stretches, a shout punches in with overshoot,
  a whisper fades.
