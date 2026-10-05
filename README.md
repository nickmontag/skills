# skills

Agent skills for Claude Code and Codex, one per folder.

| skill | what it does |
|---|---|
| [js-animate](js-animate/) | make animated videos in code: music videos, lyric videos, shorts, explainers, motion graphics, character animation, drawn in JavaScript and rendered with headless Chrome and ffmpeg |

## Install

Clone the repo once, then link the skills you want into your skills folder:

```bash
git clone https://github.com/nickmontag/skills ~/src/skills
ln -s ~/src/skills/js-animate ~/.claude/skills/js-animate
```

For Codex, link into `~/.codex/skills/` instead. `git pull` in the clone updates every linked skill.

## License

MIT
