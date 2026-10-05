# js-animate

An agent skill for making animated videos in code (music videos, lyric videos, animated shorts, explainers,
motion graphics, character animation) with Claude Code or Codex.

Every frame is drawn by JavaScript (Canvas 2D / WebGL) as a pure function of time, captured by headless Chrome and
encoded with ffmpeg. That gives total control of style and timing, and it makes it very easy to lose days to the
wrong things. This skill is what matters and what goes wrong, learned over several long music-video and short-film
projects:

- **Architecture that holds up:** `draw(t)` with no hidden state, the timeline as data, layers and a compositor, a
  page contract that turns a still into a film without a rebuild.
- **Syncing to a song:** transcription against the lyric sheet, forced alignment per section, word and letter timing,
  beats, vocal envelopes, lip sync.
- **Working with a person:** concept before code, alternatives side by side, approvals frozen by hash, every note
  turned into a rule that fails before the fix and passes after.
- **Reviewing in time, not just stills:** scenes report what they draw, and the tools turn time into numbers (text
  early or late, covered text, one-frame pops, pace, black/flash frames, freezes, bitrate).
- **Design lessons:** character appeal, consistent light, legibility, staging, motion craft, and an index of 34 looks
  (cel, anime, flat vector, risograph, woodcut, pixel art, rotoscope…).

## Install

Clone it into your skills folder:

```bash
git clone https://github.com/nickmontag/js-animate ~/.claude/skills/js-animate
```

For Codex, use `~/.codex/skills/js-animate`. The agent picks it up whenever you ask for an animation or a video made
in code; you don't need to name it.

## Requirements

- Node 20+
- Google Chrome (set `CHROME_PATH` if it isn't in the default location)
- ffmpeg on `PATH`
- Optional, for syncing to audio: Python with `openai-whisper` and `torchaudio`

Developed and tested on macOS (Apple Silicon). Linux should work with `CHROME_PATH` set; Windows is untested.

## First hour

```bash
~/.claude/skills/js-animate/scripts/new-project.sh ~/work/my-film
cd ~/work/my-film && npm install && npm run smoke
```

`smoke` runs the helper tests, a still, a contact sheet, a 2-second encode checked by ffprobe and the metrics tool,
then the probe and the checks: it proves the whole pipeline before any art depends on it. Open `index.html` for the
studio (scrub, play, step frames, jump between scenes, show the probe's marks), then replace the example character
and scenes.

## What's inside

| path | what it is |
|---|---|
| `SKILL.md` | the skill itself: what the agent reads first |
| `assets/project/` | the project scaffold: studio page, engine, tested helper kit, example cast and scenes, project-memory templates |
| `scripts/render.mjs` | stills, contact sheets, strips, onion skins, motion trails, probe data, resumable H.264 or ProRes renders |
| `scripts/checks.mjs` | built-in and per-project rules over the probe data, plus approval gates |
| `scripts/metrics.mjs` | measures the encoded file frame by frame |
| `scripts/still.sh` | one hang-safe still from plain headless Chrome |
| `references/` | motion craft, drawing in code, audio timing, hybrid pipelines, pace, the review checklist, the style library |

## License

MIT
