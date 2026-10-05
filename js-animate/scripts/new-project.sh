#!/bin/bash
# new-project.sh: scaffold a code-drawn animation project from the skill's template.
#   ~/.claude/skills/js-animate/scripts/new-project.sh ~/work/my-film
# Copies assets/project/ and the tools (render, checks, metrics, still) into the folder, then prints the next steps.
set -e
SKILL="$(cd "$(dirname "$0")/.." && pwd)"; DEST="$1"
[ -n "$DEST" ] || { echo "usage: new-project.sh <folder>"; exit 1; }
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then echo "$DEST exists and isn't empty; pick a new folder"; exit 1; fi
mkdir -p "$DEST/tools"
cp -R "$SKILL/assets/project/." "$DEST/"
cp "$SKILL/scripts/render.mjs" "$SKILL/scripts/checks.mjs" "$SKILL/scripts/metrics.mjs" "$SKILL/scripts/still.sh" "$DEST/tools/"
chmod +x "$DEST/tools/still.sh"
echo "scaffolded $DEST"
echo "next: cd \"$DEST\" && npm install && npm run smoke"
echo "then: fill in README.md (deliverables), RULES.md, STORYBOARD.md; replace the example cast and scenes"
