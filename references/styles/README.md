# Style library: the index

A menu of looks to offer when someone wants "a style", with enough cues to author each one in code. Read this index
to choose, then open only the one to three looks you need: each look is its own short file.

Every look has:
- **Is:** what it is, in one line.
- **Look for:** the tells that make it read as the real thing. Check renders against these.
- **In code:** how to fake it with Canvas 2D / WebGL, or with the numpy SDF approach in `shared.md`.
- **In motion:** how it should animate, when that matters.

The golden rule applies throughout: don't filter a photo into a style (SKILL §5). Author the shapes, then render them
the way the medium would. How things move, in any look, is in `references/motion-craft.md`.

## Start here

Match the brief first. When it doesn't name a look, offer options from more than one section (SKILL §4) rather than
defaulting to print.

| The brief says | Start with |
|---|---|
| a cartoon, "like a TV show", for kids, a mascot | `studio/modern-tv-flat.md`, `studio/classic-cel-ink-and-paint.md`, `studio/rubber-hose.md` |
| an explainer, a product or data video, a brand piece | `studio/flat-vector-motion-graphics.md` |
| anime, action, a fight | `studio/anime-cel-shaded.md`, `studio/spider-verse-mixed-media.md` |
| "cinematic", "like a feature film" | `studio/painterly-2d-feature.md`, `studio/classic-cel-ink-and-paint.md`, `studio/stop-motion-and-claymation.md` |
| a lyric video, a title sequence | `studio/kinetic-typography.md`, plus any look for the imagery |
| "handmade", an art piece, a festival short | anything in `print/`, `arthouse/` or `eras/` |
| retro, a game | `digital/pixel-art.md`, `digital/crt-vhs-artifacts.md` |

Shared machinery for every look (the cartoon kit, and the parts every print look is built from): `shared.md`.

## Print processes (`print/`)

- `gilded-age-chromolithography.md`: *Puck*/*Judge*, 1880–1905. Flat colour stones under a black key stone engraved entirely in line.
- `risograph.md`: soy-ink stencil printing, one drum per colour.
- `ben-day-dots-comic-halftone.md`: the pulp comic's cheap tint. Evenly spaced dots of one ink next to flat colour.
- `woodcut-linocut.md`: relief block. Everything that should be white is cut away, and the rest prints.
- `ukiyo-e-woodblock.md`: Edo-era Japanese colour woodblock, many blocks, water-based pigment.
- `screenprint-serigraphy.md`: ink pushed through a mesh stencil; flat opaque inks, light over dark.
- `engraving-banknote-intaglio.md`: lines cut into metal, with ink in the grooves; dense swelling line work.
- `mezzotint.md`: a plate roughened to print black, then burnished back toward light.
- `cyanotype.md`: a sun-exposed iron-salt print, Prussian blue and white.
- `xerography-photocopy.md`: photocopier toner, as in *101 Dalmatians* and punk zines.

## Studio, TV and motion-graphics looks (`studio/`)

Most requests for "an animation" land here. They all use the cartoon kit in `shared.md`. Their tells are about
design and motion more than medium, so check renders against `references/motion-craft.md` as well as their tells.

- `classic-cel-ink-and-paint.md`: Disney and Fleischer features. Inked lines on cels, flat paint, painterly backgrounds.
- `rubber-hose.md`: early sound cartoons (and *Cuphead*). Limbs like hoses, a world bouncing to the music.
- `modern-tv-flat.md`: *Adventure Time*, *Bluey*. Simple shapes and bold lines, built to be rigged.
- `upa-mid-century-flat.md`: 1950s modernist limited animation; colour that misses the line.
- `anime-cel-shaded.md`: hard-edged shading, heavily composited backgrounds, impact frames.
- `spider-verse-mixed-media.md`: CG under comic-print treatment; characters on twos, camera on ones.
- `painterly-2d-feature.md`: *Klaus*, *Arcane*. Drawn characters lit like CG.
- `stop-motion-and-claymation.md`: Aardman, Laika. Puppets photographed a frame at a time.
- `storybook-watercolor-and-gouache.md`: picture-book washes and matte paint on textured paper.
- `pencil-rough-and-pen-doodle.md`: graphite or ballpoint with the construction left in.
- `flat-vector-motion-graphics.md`: explainers. Geometric shapes animated with strict easing.
- `kinetic-typography.md`: type as the main character; words arrive on their onsets.

## Arthouse animation techniques (`arthouse/`)

Handmade and experimental methods, for when the process is part of the point.

- `silhouette-cut-paper.md`: Lotte Reiniger. Hinged black paper figures on a lightbox.
- `paint-on-glass.md`: Aleksandr Petrov. Oil paint re-smeared for every frame; scenes metamorphose.
- `pinscreen.md`: Alexeieff & Parker. Pin shadows making soft charcoal tones.
- `direct-on-film-scratch.md`: McLaren, Len Lye. Marks painted or scratched on film, new every frame.
- `rotoscope.md`: Bakshi, *A Scanner Darkly*. Drawing over real motion (from pose data, never edge detection).

## Movements and eras (`eras/`)

- `art-nouveau.md`: Mucha, 1890–1910. Whiplash curves, halo roundels, botanical borders, pastels and gold.
- `ligne-claire.md`: Hergé, Moebius. One even line weight, flat colour, detailed backgrounds.
- `wpa-national-parks-posters.md`: 1930s. 4–6 flat screenprinted colours, stepped atmospheric bands.
- `psychedelic-concert-posters.md`: 1966–68. Melting lettering, vibrating complementary colours.

## Digital-native (`digital/`)

- `1-bit-dithering.md`: *Return of the Obra Dinn*, early Mac art. Two colours, ordered dither.
- `crt-vhs-artifacts.md`: scanlines, bloom, tracking wobble, soft chroma.
- `pixel-art.md`: a small grid of hand-placed pixels, scaled up by a whole number.

## More to try

`more-to-try.md`: short notes on cutout puppet, sticker/kawaii, neon, isometric, low-poly, squigglevision, stippling,
sumi-e, marbling, stained glass, Constructivism, hand-tinted photographs, blueprints and layered paper cutout.
