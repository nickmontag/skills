# Mezzotint

Print processes. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** a copper plate roughened all over to print black, then burnished back toward light.
- **Look for:**
  - Velvety deep blacks.
  - Forms emerging from darkness with soft, grainy transitions.
  - No lines at all.
- **In code:**
  - Start from solid black.
  - Subtract light with dense stochastic grain (`noise(1px) > value`).
  - Blur the grain 0.5 px so it's velvety, not speckled.
- **In motion:** slow reveals from dark suit it.
