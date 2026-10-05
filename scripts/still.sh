#!/bin/zsh
# still.sh: capture one frame of a page with plain headless Chrome (no Node/puppeteer needed).
#   ./still.sh "http://localhost:8000/page.html?raw&t=1.25" out.png [W] [H]
# Chrome sometimes hangs after writing the screenshot, so this waits for the file and closes Chrome itself.
# The page should draw synchronously or before the virtual-time budget runs out (a ?raw mode that shows
# only the canvas at 1:1 makes the capture exact).
set -e
URL=$1; OUT=$2; W=${3:-1920}; H=${4:-1080}
CHROME=${CHROME_PATH:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=$(mktemp -d)
rm -f "$OUT"
"$CHROME" --headless=new --user-data-dir="$PROFILE" --disable-gpu --hide-scrollbars --window-size=$W,$H \
  --virtual-time-budget=${BUDGET:-10000} --screenshot="$OUT" "$URL" >/dev/null 2>&1 &
PID=$!
for _ in {1..240}; do [ -s "$OUT" ] && break; sleep 0.5; done
sleep 0.5; kill $PID 2>/dev/null; wait $PID 2>/dev/null || true
rm -rf "$PROFILE"
[ -s "$OUT" ] || { echo "capture failed: $URL" >&2; exit 1; }
echo "$OUT"
