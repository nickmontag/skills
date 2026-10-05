# Xerography / photocopy

Print processes. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** photocopier toner, as in Disney's *101 Dalmatians* and punk zines.
- **Look for:**
  - Crunchy blacks and scratchy lines.
  - Sketchy construction lines left in.
  - Toner speckle in whites.
  - Edge "halo" drop-out inside big blacks.
  - Generation loss.
- **In code:**
  - Threshold a *drawn* line layer with noise.
  - Add sparse toner specks.
  - For big blacks, lighten the interior slightly away from edges (the copier's edge enhancement).
- **In motion:** line boil on twos.
