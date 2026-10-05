# Engraving / banknote intaglio

Print processes. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** lines cut into metal. Ink sits in the grooves.
- **Look for:**
  - Dense parallel lines that swell and thin to model form.
  - Crosshatching in shadows, dot-and-lozenge fill in darks.
  - Guilloche rosettes.
  - Crisp, tiny, perfect-looking work (the opposite of linocut's wobble).
- **In code:**
  - `carve` with phase along a flow field that wraps the form (e.g. `sdf`, or one axis of a
    parametrised surface).
  - A second, rotated pass only where the value is darkest.
  - Guilloche: `r = R + a·sin(kθ)` families.
  - Minimal wobble.
