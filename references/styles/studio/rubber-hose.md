# Rubber hose (Fleischer and early Disney, 1928–35; *Cuphead*)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** early sound cartoons: limbs like hoses, and a whole world bouncing to the music.
- **Look for:**
  - Limbs with no elbows or knees: smooth bending tubes of constant width.
  - Pie-cut eyes, white gloves, big round shoes, black bodies.
  - Everything idles to the beat: bouncing, swaying, squashing.
  - Film artifacts: grain, gate weave, flicker, dust; sepia or two-strip color.
- **In code:**
  - A limb is one thick stroke along a quadratic curve from shoulder to hand. Bend it by moving the control
    point; there's no IK.
  - Idles are cycles locked to the beat grid (`references/audio-timing.md`), so the whole world pulses together.
  - Grain and weave go in a final pass, changed on twos (bitrate, SKILL §2).
- **In motion:** extreme squash and stretch, rubbery overshoot (`springKeys` with a low `zeta`), on twos.
