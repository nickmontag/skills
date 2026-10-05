# Anime / cel-shaded (TV anime, Studio Ghibli, Makoto Shinkai)

Studio, TV and motion-graphics looks. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** Japanese limited animation with hard-edged shading and heavily composited backgrounds.
- **Look for:**
  - Two-tone (sometimes three) hard-edged shadows with designed shapes, and a highlight shape on hair.
  - Large layered eyes with specular highlights; small mouths and noses.
  - Held drawings with the camera sliding over them, and sudden bursts of full animation in action scenes.
  - Speed lines, impact frames and smears.
  - Painted skies with big cumulus clouds; lens flares, bloom and light rays in compositing.
- **In code:**
  - Crescent shadows, or authored shadow shapes (`references/drawing-in-code.md` §3). The hair highlight is a shape
    clipped to the hair.
  - A compositing pass: bloom (blurred bright areas added back), a soft gradient overlay, light rays.
  - Impact frames: 1–3 frames in flat black and one color, or inverted.
- **In motion:** threes for talking, ones for action, pans over held drawings, and hits with hit-stop, shake and
  a flash (`references/motion-craft.md` §6).
