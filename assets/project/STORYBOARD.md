# Storyboard (v1, date)

The beats in order. Times live in `data/timing.js`; this table is for people. Change both together, and bump the
version when the person approves a new one.

**The point:** one sentence the viewer should leave with. A rule of thumb, not a law: if a beat doesn't serve it,
consider cutting it or making it serve.

- **Tempo** sets the pace limits `checks.mjs` applies: `still`, `tender`, `normal` or `action`.
- **Blocking** is one line per character: where they start, which way they face, where they move (toward or away from
  camera), and what triggers each reaction. Agree it before animating.
- **Light** is the rule every shadow in the scene obeys: where the light is and what it does.
- **Engine** is what makes the shot: code (2D), GPU code, Blender, an image or video model, footage
  (`references/hybrid.md`).

| # | scene | start | length | tempo | what happens | blocking | light | engine | status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | walk | 0:00 | 6.0 s | normal | He walks through the field; a star falls ahead of him on the hit | walker: enters left, walks right, faces +x throughout, doesn't react | moon, upper left | code | draft |
| 2 | title | 0:06 | 5.0 s | tender | Dip to black; the title rises letter by letter; fade out | none | none: flat | code | draft |
