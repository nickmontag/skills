# Classic cel / ink-and-paint (Disney and Fleischer features, 1930s–90s)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** hand-inked lines on clear cels, painted flat on the back, shot over painted backgrounds.
- **Look for:**
  - Clean ink lines with a slight pressure taper, and colored lines on soft areas.
  - Flat paint with one shadow tone, sometimes a soft blush on cheeks.
  - Backgrounds far more detailed and painterly (gouache, watercolor) than the characters.
  - Multiplane depth: near and far planes sliding at different speeds.
  - Full animation: squash and stretch, arcs and follow-through everywhere.
- **In code:**
  - Characters use the clean-cartoon rules (`references/drawing-in-code.md` §3), with gently tapered lines.
  - Backgrounds are rendered separately and more softly (gradients, dry-brush texture, soft edges), never
    outlined like the characters. That contrast is the look.
  - Multiplane with `plane()` (`references/motion-craft.md` §7).
- **In motion:** ones for big action, twos otherwise. It's the look that most punishes stiff motion.
