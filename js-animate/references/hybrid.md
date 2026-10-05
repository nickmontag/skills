# Choosing the engine for each element

Code-drawn animation has a ceiling. Find it on day one, not after two rejected rounds.

**Code is strong at:** line, shape and type; graphic, print, paper and ink looks; motion graphics; stylised
characters (cartoon, cutout, silhouette); particles and effects; exact sync; anything that must match an approved
still pixel for pixel; fast iteration and re-timing.

**Code is weak at:** believable people (faces, hands, skin), photoreal materials and light, soft organic 3D forms,
cloth, hair and fluid simulation, crowds in perspective. On one short film, two rounds of code-drawn people were
rejected. Soft height-field shading "looked like toys and clay", and a painted-glass treatment was dropped for a
different pipeline. Days went into both before the question was asked properly.

Ask it in the first conversation: for each element of the storyboard, which engine makes it? Record the answer in
the storyboard's Engine column, and say plainly which elements you'd advise against drawing in code.

| engine | good for | notes |
|---|---|---|
| Canvas 2D (the scaffold) | nearly everything drawn | the default |
| GPU code in the same page (a WebGL2 fragment shader: SDF ray marching, height fields) | a few hero objects that need real light, reflection or refraction (a pen tip at macro scale, a notebook, glass); compositing passes | shares the page's camera, light and timeline; render finals on one machine, since GPUs differ in float precision; read back through the canvas as usual |
| Blender, headless and scripted | physical props, cloth and paper, real 3D lighting | render PNG or EXR sequences with alpha, and bring them in as layers |
| an image model | a painted or photographic still (a photo on a mantel, a plate) | only approved references go in; prompts use the person's words |
| a video model | wide shots with people, when code can't make them | last in the order: fill it into an approved rough cut |
| footage, or pose data from it | real human motion | pose landmarks driving authored drawings (`references/styles/arthouse/rotoscope.md`) |

## Bringing outside media into the page

- **Use image sequences, not `<video>`.** Seeking a video element in headless Chrome is asynchronous and not frame
  accurate. Convert with ffmpeg (`ffmpeg -i in.mov frames/%05d.png`) and draw frame `Math.round(t * fps)`. Load
  what the scene needs with `studio.image(src)` so `ready` waits for it, or pre-pack frames into an atlas.
- **Glue with one final pass.** Grain fixed to the frame, one grade, the same bloom: the same finish over media
  from different engines makes them one film.
- **Hand-offs between engines are where bad frames hide:** a stray frame, a double image, a grey frame. Run
  `metrics.mjs` across every seam, and look at a `--strip` either side of it.
- **Generated video that must carry exact linework** (lettering, a drawn character): check it frame by frame
  against the approved drawing. If it drifts, track the surface and restore the exact ink under the model's light.

## Handing off to an editor or compositor

- **One shot per scene, with handles:** `render.mjs --video --scene=NAME --handles=12 --prores` gives ProRes 422 HQ,
  10-bit, BT.709. With handles, the scene is rendered on its own (`?solo`) past both ends, so scenes should draw
  sensibly a little before and after their span.
- **For compositing:** `--prores=4444` renders with `?alpha` (the background layer left out) and keeps the alpha
  channel. PNG sequences work too.
- **Audio** goes as separate WAV stems, not baked into shots.
- Send a contact sheet and the checks and metrics reports with the shots.

## Paid APIs (image, video and voice models)

- **Every call needs the person's OK in chat, with its exact cost, each time.** A plan that lists the spend is not
  an OK. A submitted job can't be cancelled for free.
- **Enforce it in code.** The wrapper refuses any job without a recorded permission (who agreed, when, their words,
  the cost), enforces a budget cap, and logs every job with its cost. On the film above, that guard was only added
  after two unapproved spends.
- **Only approved references go to a model.** Early tests are direction, not input.
- **Prompt from `RULES.md`, not from a paraphrase.** A plan that said "photographic" became a prompt for real photos
  when the person meant a stylised 3D animated feature. They rejected all four. Some words trip content filters (a
  studio's name, "soft skin" next to a child): describe the look instead of naming it.
- **Generated items go into `shots.json`** like everything else, awaiting approval, with the prompt and the cost.
