#!/usr/bin/env bash
# Builds the whisper-cli that ships inside the Mac app, so captions work without Homebrew. It
# links statically and runs on Apple's GPU through Metal. whisper.cpp is MIT licensed.
#
#   scripts/build-whisper.sh <output folder>
#
# Writes bin/whisper-cli into the output folder. The speech model is downloaded separately, by
# `ucut setup --speech` or the app's first-run screen.
set -euo pipefail

version="1.9.5"
sha256="ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mkdir -p "${1:?Give an output folder}" && cd "$1" && pwd)"
cache="${UCUT_BUILD_CACHE:-$root/dist/cache}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export MACOSX_DEPLOYMENT_TARGET=15.0

file="whisper.cpp-v$version.tar.gz"
mkdir -p "$cache"
if [ ! -f "$cache/$file" ]; then
  curl -fsSL --retry 3 -o "$cache/$file.part" \
    "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v$version.tar.gz"
  mv "$cache/$file.part" "$cache/$file"
fi
echo "$sha256  $cache/$file" | shasum -a 256 -c --quiet

echo "Building whisper.cpp $version"
tar -xzf "$cache/$file" -C "$work"
source="$work/whisper.cpp-$version"
cmake -S "$source" -B "$source/build" -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 >/dev/null
cmake --build "$source/build" --config Release --target whisper-cli -j >/dev/null

mkdir -p "$out/bin"
cp "$source/build/bin/whisper-cli" "$out/bin/whisper-cli"
if otool -L "$out/bin/whisper-cli" | tail -n +2 | grep -vqE "^\s+(/usr/lib/|/System/Library/)"; then
  echo "whisper-cli links a library outside macOS:" >&2
  otool -L "$out/bin/whisper-cli" >&2
  exit 1
fi
cp "$source/LICENSE" "$out/LICENSE-whisper.cpp.txt"
echo "Built $out/bin/whisper-cli"
