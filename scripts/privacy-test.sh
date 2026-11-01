#!/usr/bin/env bash
# Proves the default pipeline never touches the network: it runs a full reel inside a macOS
# sandbox that denies every outbound connection except to this machine.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cat > "$work/no-network.sb" <<'PROFILE'
(version 1)
(allow default)
(deny network-outbound (remote ip "*:*"))
(allow network-outbound (remote ip "localhost:*"))
PROFILE

export UCUT_HOME="$work/home"
sandbox-exec -f "$work/no-network.sb" \
  node --conditions=source --import tsx "$root/packages/engine/src/bin.ts" \
  make "$root/library/samples" -o "$work/out.mp4" --duration 4 --quality draft --vibe hype

test -s "$work/out.mp4"

# A recording with a sound track, so that it's listened to where the speech model is installed.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=s=1280x720:r=30:d=4" -f lavfi -i "sine=f=220:d=4" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$work/recording.mp4"
sandbox-exec -f "$work/no-network.sb" \
  node --conditions=source --import tsx "$root/packages/engine/src/bin.ts" \
  demo "$work/recording.mp4" -o "$work/demo.mp4" --name Acme --quality draft

test -s "$work/demo.mp4"
echo "Privacy test passed: a reel and a demo were made with the network blocked."
