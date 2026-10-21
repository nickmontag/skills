# skills

Agent skills for Claude Code and Codex, one per folder under `skills/`.

| skill | what it does |
|---|---|
| [js-animate](skills/js-animate/) | make animated videos in code: music videos, lyric videos, shorts, explainers, motion graphics, character animation, drawn in JavaScript and rendered with headless Chrome and ffmpeg |
| [domain-finder](skills/domain-finder/) | check whether domain names are actually registrable at retail, routing each TLD to a data source that doesn't lie (bogus RDAP 404s, premium-held names), and find available names for a project |

## Install

In Claude Code, add this repo as a plugin marketplace, then install the skills you want:

```
/plugin marketplace add nickmontag/skills
/plugin install js-animate@nickmontag-skills
/plugin install domain-finder@nickmontag-skills
```

`/plugin marketplace update nickmontag-skills` picks up new versions.

Or clone the repo once and link the skills you want into your skills folder:

```bash
git clone https://github.com/nickmontag/skills ~/src/nickmontag-skills
ln -s ~/src/nickmontag-skills/skills/js-animate ~/.claude/skills/js-animate
ln -s ~/src/nickmontag-skills/skills/domain-finder ~/.claude/skills/domain-finder
```

For Codex, link into `~/.codex/skills/` instead. `git pull` in the clone updates every linked skill.

## Adding a skill

A new folder under `skills/` with a `SKILL.md`, a row in the table above, and an entry in
[.claude-plugin/marketplace.json](.claude-plugin/marketplace.json). When a skill changes, bump its `version` there so
plugin installs update.

## License

MIT, by Nick Montag (see [LICENSE](LICENSE))
