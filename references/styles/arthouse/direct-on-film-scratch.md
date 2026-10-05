# Direct-on-film / scratch (Norman McLaren, Len Lye)

Arthouse animation techniques. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** marks painted or scratched straight onto film stock.
- **Look for:**
  - Jittery abstract marks that change completely every frame.
  - Sprocket-edge wobble, dust and hairs.
  - Colored dyes bleeding.
  - Often synced to music.
- **In code:**
  - Generate marks fresh per frame from a seeded RNG keyed on frame number.
  - Add a gate-weave offset.
  - Overlay a scratch and dust layer.
- **In motion:** the boil *is* the style. Sync the marks to beats (`references/audio-timing.md`).
