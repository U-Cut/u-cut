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
echo "Privacy test passed: a full reel was made with the network blocked."
