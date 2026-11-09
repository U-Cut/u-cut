#!/usr/bin/env bash
# Builds the FFmpeg and ffprobe that ship inside the Mac app: LGPL only, with no GPL or non-free
# parts, Apple's hardware video encoder, and zimg for turning iPhone HDR video into SDR.
# See docs/decisions/0004-ffmpeg-distribution.md.
#
#   scripts/build-ffmpeg.sh <output folder>
#
# Writes bin/ffmpeg, bin/ffprobe and LICENSE-ffmpeg.md (the configure line and where the source
# is) into the output folder. Downloads go to $UCUT_BUILD_CACHE (default dist/cache).
set -euo pipefail

ffmpeg_version="9.0.2"
ffmpeg_sha256="8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e"
zimg_version="3.0.6"
zimg_sha256="be89390f13a5c9b2388ce0f44a5e89364a20c1c57ce46d382b1fcc3967057577"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mkdir -p "${1:?Give an output folder}" && cd "$1" && pwd)"
cache="${UCUT_BUILD_CACHE:-$root/dist/cache}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
jobs="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
export MACOSX_DEPLOYMENT_TARGET=15.0

fetch() { # url, file, sha256
  mkdir -p "$cache"
  if [ ! -f "$cache/$2" ]; then
    curl -fsSL --retry 3 -o "$cache/$2.part" "$1"
    mv "$cache/$2.part" "$cache/$2"
  fi
  echo "$3  $cache/$2" | shasum -a 256 -c --quiet
}
# Homebrew names it glibtoolize.
command -v libtoolize >/dev/null || export LIBTOOLIZE=glibtoolize

fetch "https://ffmpeg.org/releases/ffmpeg-$ffmpeg_version.tar.xz" "ffmpeg-$ffmpeg_version.tar.xz" "$ffmpeg_sha256"
fetch "https://github.com/sekrit-twc/zimg/archive/refs/tags/release-$zimg_version.tar.gz" \
  "zimg-release-$zimg_version.tar.gz" "$zimg_sha256"

echo "Building zimg $zimg_version"
tar -xzf "$cache/zimg-release-$zimg_version.tar.gz" -C "$work"
(
  cd "$work/zimg-release-$zimg_version"
  ./autogen.sh >/dev/null
  ./configure --quiet --prefix="$work/deps" --enable-static --disable-shared >/dev/null
  make -j"$jobs" >/dev/null
  make install >/dev/null
)

echo "Building FFmpeg $ffmpeg_version"
tar -xJf "$cache/ffmpeg-$ffmpeg_version.tar.xz" -C "$work"
configure=(
  --prefix="$work/ffmpeg-out"
  --disable-gpl --disable-nonfree
  --enable-static --disable-shared
  --disable-autodetect
  --enable-videotoolbox --enable-audiotoolbox
  --enable-zlib --enable-libzimg
  --disable-network --disable-outdevs
  # lavfi makes test pictures and silence, which HyperFrames and U-Cut both use.
  --disable-indevs --enable-indev=lavfi
  --disable-ffplay --disable-doc --disable-debug
  --pkg-config-flags=--static
  "--extra-cflags=-mmacosx-version-min=15.0"
  "--extra-ldflags=-mmacosx-version-min=15.0"
  # zimg is C++.
  --extra-libs=-lc++
)
(
  cd "$work/ffmpeg-$ffmpeg_version"
  PKG_CONFIG_PATH="$work/deps/lib/pkgconfig" ./configure "${configure[@]}" >/dev/null
  make -j"$jobs" >/dev/null
  make install >/dev/null
)

mkdir -p "$out/bin"
cp "$work/ffmpeg-out/bin/ffmpeg" "$work/ffmpeg-out/bin/ffprobe" "$out/bin/"

# A GPL part would show up here, so the build stops instead of shipping it.
if "$out/bin/ffmpeg" -hide_banner -buildconf | grep -q -- "--enable-gpl"; then
  echo "This FFmpeg has GPL parts, which can't ship inside the app." >&2
  exit 1
fi
# Only macOS's own libraries, so it runs on any Mac without Homebrew.
for tool in ffmpeg ffprobe; do
  if otool -L "$out/bin/$tool" | tail -n +2 | grep -vqE "^\s+(/usr/lib/|/System/Library/)"; then
    echo "$tool links a library outside macOS:" >&2
    otool -L "$out/bin/$tool" >&2
    exit 1
  fi
done

cat >"$out/LICENSE-ffmpeg.md" <<NOTE
# FFmpeg in U-Cut

U-Cut runs FFmpeg $ffmpeg_version and zimg $zimg_version as separate programs. FFmpeg is licensed
under the GNU Lesser General Public License, version 2.1 or later, and zimg under the WTFPL.

- FFmpeg source: https://ffmpeg.org/releases/ffmpeg-$ffmpeg_version.tar.xz (sha256 $ffmpeg_sha256).
  Each U-Cut release also attaches this exact file.
- zimg source: https://github.com/sekrit-twc/zimg/archive/refs/tags/release-$zimg_version.tar.gz
- How it was built: scripts/build-ffmpeg.sh in https://github.com/U-Cut/u-cut, with

\`\`\`
./configure ${configure[*]}
\`\`\`

You may replace bin/ffmpeg and bin/ffprobe inside U-Cut with your own build.
NOTE

"$out/bin/ffmpeg" -hide_banner -version | head -1
echo "Built $out/bin/ffmpeg and $out/bin/ffprobe"
