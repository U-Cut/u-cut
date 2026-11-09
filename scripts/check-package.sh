#!/usr/bin/env bash
# Checks dist/U-Cut.app the way a new Mac would meet it: an empty home folder, and nothing on the
# PATH but macOS's own tools, so no Homebrew, Node or FFmpeg can help it along.
#
#   scripts/check-package.sh            uses the browser already downloaded, if there is one
#   scripts/check-package.sh --download downloads the browser into the empty home, as a new Mac does
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/dist/U-Cut.app/Contents/Resources/runtime"
[ -f "$runtime/runtime.json" ] || { echo "Run scripts/package-mac.sh first." >&2; exit 1; }

home="$(mktemp -d)"
trap 'rm -rf "$home"' EXIT
# The app runs the engine from a copy in Application Support, whose name has a space, so the
# check does the same. A path that only works without spaces fails here.
installed="$home/Library/Application Support/U-Cut/runtime/check"
mkdir -p "$(dirname "$installed")"
cp -cR "$runtime" "$installed" 2>/dev/null || cp -R "$runtime" "$installed"
extra=()
clean() {
  env -i HOME="$home" PATH=/usr/bin:/bin:/usr/sbin:/sbin TMPDIR="${TMPDIR:-/tmp}" ${extra[@]+"${extra[@]}"} \
    "$installed/bin/node" "$installed/engine/packages/engine/dist/bin.js" "$@"
}
fail() { echo "::error::$1" >&2; exit 1; }

echo "Every program inside uses only macOS's own libraries"
while IFS= read -r -d '' file; do
  file -b "$file" | grep -q "Mach-O" || continue
  outside="$(otool -L "$file" | tail -n +2 | awk '{print $1}' | grep -vE '^(/usr/lib/|/System/Library/|@rpath/|@loader_path/|@executable_path/)' || true)"
  [ -z "$outside" ] || fail "${file#"$runtime"/} links $outside, which a new Mac won't have."
done < <(find "$runtime" -type f -print0)

echo "FFmpeg has no GPL parts"
if "$runtime/bin/ffmpeg" -hide_banner -buildconf | grep -q -- "--enable-gpl"; then
  fail "The bundled FFmpeg was built with GPL parts."
fi
"$runtime/bin/ffmpeg" -hide_banner -encoders | grep -q h264_videotoolbox ||
  fail "The bundled FFmpeg can't encode H.264 with VideoToolbox."
"$runtime/bin/ffmpeg" -hide_banner -filters | grep -q " zscale " ||
  fail "The bundled FFmpeg can't tone-map HDR video (no zscale)."

echo "The engine starts with its own tools"
version="$(clean --version)"
expected="$(sed -n 's/.*"version": "\(.*\)".*/\1/p' "$runtime/runtime.json")"
[ "$version" = "$expected" ] || fail "ucut --version says $version, but the app is $expected."
clean doctor | tee "$home/doctor.txt"
grep -q "(inside the app)" "$home/doctor.txt" || fail "The engine didn't use the FFmpeg inside the app."

if [ "${1:-}" = "--download" ]; then
  echo "Downloading the browser, as a new Mac does"
  clean setup
else
  # Reuse a browser this machine already has, so a local check doesn't download 93 MB each time.
  existing="$(node -e "import('$root/packages/engine/dist/setup/parts.js').then(m => console.log(m.browserPath() ?? ''))" 2>/dev/null || true)"
  if [ -n "$existing" ]; then
    extra=(HYPERFRAMES_BROWSER_PATH="$existing")
  else
    clean setup
  fi
fi

echo "It makes a reel"
clean make "$installed/engine/library/samples" -o "$home/reel.mp4" --duration 6 --quality draft --vibe hype
# The interface lists the styles and music from the same folders, so ask for that too.
clean templates | grep -q "Café crawl" || fail "The engine couldn't list its styles from where the app runs it."

echo "It serves the interface the app shows"
port=$((4300 + RANDOM % 600))
while lsof -ti "tcp:$port" >/dev/null 2>&1; do port=$((port + 1)); done
# exec, so $! is the server itself and stopping it stops the server, not a shell around it.
(exec env -i HOME="$home" PATH=/usr/bin:/bin:/usr/sbin:/sbin TMPDIR="${TMPDIR:-/tmp}" ${extra[@]+"${extra[@]}"} \
  "$installed/bin/node" "$installed/engine/packages/engine/dist/bin.js" serve --no-open --port "$port") \
  >"$home/serve.log" 2>&1 &
server=$!
trap '{ kill "$server" && wait "$server"; } 2>/dev/null; rm -rf "$home"' EXIT
for _ in $(seq 1 60); do curl -fsS "http://localhost:$port/api/status" >/dev/null 2>&1 && break; sleep 0.5; done
page="$(curl -fsS "http://localhost:$port/" || true)"
catalog="$(curl -fsS "http://localhost:$port/api/catalog" || true)"
{ kill "$server" && wait "$server"; } 2>/dev/null || true
case "$page" in *'<div id="app">'*) ;; *) fail "The engine didn't serve the interface from where the app runs it." ;; esac
case "$catalog" in *'"cafe-crawl"'*'"setup"'*) ;; *) fail "The engine's catalog came back without its styles: ${catalog:0:200}" ;; esac
probe="$("$runtime/bin/ffprobe" -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,color_transfer -of csv=p=0 "$home/reel.mp4")"
case "$probe" in
  h264,1080,1920,bt709*) echo "Made a 1080x1920 H.264 reel." ;;
  *) fail "The reel came out as $probe, not 1080x1920 H.264 SDR." ;;
esac
echo "The app works on its own."
