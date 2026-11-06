#!/usr/bin/env bash
# still.sh: capture one frame of a page with plain headless Chrome (no Node/puppeteer needed).
#   ./still.sh "file:///…/index.html?raw&t=1.25" out.png [W] [H]     a screenshot of the window, W×H (1920×1080)
#   ./still.sh --dump "file:///…/index.html" 1.25 out.png [W] [H]    the exact pixels window.renderAt(1.25) returns
#                                                                      (alpha included; no window, scaling or page colour)
# --dump loads the page (with ?render, as render.mjs does) in a frame of a small wrapper page, waits for window.ready,
# calls renderAt and reads the data URL back from Chrome's --dump-dom. File pages only: for a page on a server,
# use render.mjs --stills.
# Chrome runs with the GPU on (with --disable-gpu, WebGL pages capture black) and may read file:// images (a canvas
# that draws them stays readable). It sometimes hangs after writing its output, so this waits for the output and
# closes Chrome itself. BUDGET=ms of virtual time the page gets (10000).
set -e
DUMP=; [ "$1" = --dump ] && { DUMP=1; shift; }
URL=$1
if [ -n "$DUMP" ]; then T=$2; OUT=$3; W=${4:-1920}; H=${5:-1080}; else OUT=$2; W=${3:-1920}; H=${4:-1080}; fi
[ -n "$URL" ] && [ -n "$OUT" ] || { sed -n '2,4p' "$0"; exit 1; }
if [ "$(uname)" = Darwin ]; then
  CHROME=${CHROME_PATH:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}; GPU=(--use-angle=metal)
else
  CHROME=${CHROME_PATH:-google-chrome}
  GPU=(--use-angle=vulkan --enable-features=Vulkan "--disable-gl-extensions=GL_EXT_shader_framebuffer_fetch GL_EXT_shader_framebuffer_fetch_non_coherent GL_ARM_shader_framebuffer_fetch")
fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FLAGS=(--headless=new --user-data-dir="$TMP/profile" --allow-file-access-from-files --ignore-gpu-blocklist "${GPU[@]}"
  --hide-scrollbars --window-size="$W,$H" --virtual-time-budget="${BUDGET:-10000}")
rm -f "$OUT"
if [ -z "$DUMP" ]; then
  "$CHROME" "${FLAGS[@]}" --screenshot="$OUT" "$URL" >/dev/null 2>&1 &
  PID=$!
  for _ in {1..240}; do [ -s "$OUT" ] && break; sleep 0.5; done
  sleep 0.5; kill $PID 2>/dev/null || true; wait $PID 2>/dev/null || true
  [ -s "$OUT" ] || { echo "capture failed: $URL" >&2; exit 1; }
  echo "$OUT"; exit 0
fi
case "$URL" in file:*) ;; *) echo "--dump takes a file:// page; for a server page use render.mjs --stills" >&2; exit 1;; esac
P=${URL#file://}; P=${P%%[?#]*}; P=$(printf '%b' "${P//%/\\x}")
[ -f "$P" ] || { echo "no such page: $P" >&2; exit 1; }
case "$URL" in *\?*) SRC="$URL&render";; *) SRC="$URL?render";; esac
JSURL=$(printf '%s' "$SRC" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g")
cat > "$TMP/wrap.html" <<EOF
<!doctype html><body style="margin:0"><iframe id="f" style="width:${W}px;height:${H}px;border:0"></iframe><script>
const f = document.getElementById('f'), done = s => { const o = document.createElement('textarea'); o.id = 'dump'; o.textContent = s; document.body.append(o); };
f.onload = () => { const w = f.contentWindow, t0 = Date.now();
  const go = async () => { try { if (w.ready !== true) return Date.now() - t0 > 60000 ? done('error: window.ready never became true') : setTimeout(go, 20);
    if (typeof w.renderAt !== 'function') return done('error: the page has no window.renderAt');
    done(String(await w.renderAt(${T:-0}))); } catch (e) { done('error: ' + e); } };
  go(); };
f.src = '$JSURL';
</script></body>
EOF
"$CHROME" "${FLAGS[@]}" --dump-dom "file://$TMP/wrap.html" > "$TMP/dom.html" 2>/dev/null &
PID=$!
for _ in {1..240}; do grep -q '</html>' "$TMP/dom.html" 2>/dev/null && break; sleep 0.5; done
kill $PID 2>/dev/null || true; wait $PID 2>/dev/null || true
DATA=$(grep -o '<textarea id="dump">[^<]*' "$TMP/dom.html" | sed 's/<textarea id="dump">//')
case "$DATA" in
  data:image/*) printf '%s' "${DATA#*,}" | base64 --decode > "$OUT"; echo "$OUT";;
  "") echo "capture failed: no result from $URL (did the page load? is BUDGET long enough?)" >&2; exit 1;;
  *) echo "capture failed: ${DATA:0:300}" >&2; exit 1;;
esac
