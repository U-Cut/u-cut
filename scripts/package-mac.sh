#!/usr/bin/env bash
# Builds the downloadable Mac app, dist/U-Cut.app, and its disk image, dist/U-Cut.dmg.
# The app carries Node, FFmpeg, whisper-cli, the photo sorter and the engine, so it needs nothing
# else installed. See docs/decisions/0024-the-app-carries-its-own-tools.md.
#
#   scripts/package-mac.sh
#
# It needs the Xcode command line tools, plus cmake, autoconf, automake, libtool and pkg-config
# (brew install cmake autoconf automake libtool pkg-config) the first time, to build FFmpeg and
# whisper-cli. Those builds are kept in dist/tools and reused.
#
# Set UCUT_SIGN_IDENTITY to a "Developer ID Application" certificate's name to sign for
# notarization. Without it the app is signed ad hoc, and macOS asks people to approve it once.
set -euo pipefail

node_version="24.22.2"
node_sha256="1f5ac075be50bed4780ea3be19a007fda95ea4d527d28d76d0b91de47d915115"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist="$root/dist"
cache="${UCUT_BUILD_CACHE:-$dist/cache}"
tools="${UCUT_TOOLS_BUILD:-$dist/tools}"
app="$dist/U-Cut.app"
contents="$app/Contents"
runtime="$contents/Resources/runtime"
version="$(node -p "require('$root/packages/engine/package.json').version")"
build="$(git -C "$root" rev-parse --short=12 HEAD 2>/dev/null || date +%s)"
identity="${UCUT_SIGN_IDENTITY:-}"
pnpm_run() { COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm "$@"; }
say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

say "Building U-Cut $version ($build)"
cd "$root"
pnpm_run build >/dev/null

[ -x "$tools/bin/ffmpeg" ] && [ -x "$tools/bin/ffprobe" ] || scripts/build-ffmpeg.sh "$tools"
[ -x "$tools/bin/whisper-cli" ] || scripts/build-whisper.sh "$tools"

say "Building the app and the photo sorter"
swift build --package-path apps/mac -c release --product UCut >/dev/null
swift build --package-path apps/mac -c release --product ucut-vision >/dev/null
swift_bin="$(swift build --package-path apps/mac -c release --show-bin-path)"

say "Getting Node $node_version"
node_archive="node-v$node_version-darwin-arm64.tar.xz"
mkdir -p "$cache"
if [ ! -f "$cache/$node_archive" ]; then
  curl -fsSL --retry 3 -o "$cache/$node_archive.part" "https://nodejs.org/dist/v$node_version/$node_archive"
  mv "$cache/$node_archive.part" "$cache/$node_archive"
fi
echo "$node_sha256  $cache/$node_archive" | shasum -a 256 -c --quiet
node_work="$(mktemp -d)"
trap 'rm -rf "$node_work"' EXIT
tar -xJf "$cache/$node_archive" -C "$node_work"
node_dir="$node_work/node-v$node_version-darwin-arm64"

say "Putting the app together"
rm -rf "$app"
mkdir -p "$contents/MacOS" "$runtime/bin" "$runtime/licenses"
cp "$swift_bin/UCut" "$contents/MacOS/UCut"
cp apps/mac/Icon/AppIcon.icns "$contents/Resources/AppIcon.icns"
cp "$node_dir/bin/node" "$runtime/bin/node"
cp "$tools/bin/ffmpeg" "$tools/bin/ffprobe" "$tools/bin/whisper-cli" "$runtime/bin/"
cp "$swift_bin/ucut-vision" "$runtime/bin/ucut-vision"
cp "$node_dir/LICENSE" "$runtime/licenses/LICENSE-node.txt"
cp "$tools/LICENSE-ffmpeg.md" "$tools/LICENSE-whisper.cpp.txt" "$runtime/licenses/"

# The engine and only the packages it runs with, in the same layout as this repository, so the
# engine finds its templates and library the same way it does here.
engine="$runtime/engine"
pnpm_run --filter @u-cut/engine deploy --prod "$engine/packages/engine" >/dev/null
rm -f "$engine/packages/engine/pnpm-lock.yaml" "$engine/packages/engine/pnpm-workspace.yaml"
mkdir -p "$engine/apps/web" "$engine/classifiers"
cp -R templates library registry "$engine/"
cp -R apps/web/dist "$engine/apps/web/dist"
cp classifiers/taxonomy.yaml classifiers/scene-model.json "$engine/classifiers/"
cp LICENSE NOTICE "$engine/"
find "$engine" -name ".DS_Store" -delete

ffmpeg_version="$("$tools/bin/ffmpeg" -hide_banner -version | head -1 | cut -d' ' -f3)"
cat >"$runtime/runtime.json" <<JSON
{
  "version": "$version",
  "build": "$build",
  "node": "$node_version",
  "ffmpeg": "$ffmpeg_version"
}
JSON

cat >"$contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>U-Cut</string>
  <key>CFBundleDisplayName</key><string>U-Cut</string>
  <key>CFBundleIdentifier</key><string>io.github.mayank29deo.ucut</string>
  <key>CFBundleExecutable</key><string>UCut</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>LSArchitecturePriority</key><array><string>arm64</string></array>
  <key>LSApplicationCategoryType</key><string>public.app-category.video</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>Apache-2.0. U-Cut contributors.</string>
</dict>
</plist>
PLIST

say "Signing"
if [ -n "$identity" ]; then
  # Notarization wants every program inside signed with the hardened runtime. Node compiles
  # JavaScript as it runs and loads native modules, so it gets the entitlements for that.
  entitlements="$(mktemp)"
  cat >"$entitlements" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
XML
  while IFS= read -r -d '' file; do
    if file -b "$file" | grep -q "Mach-O"; then
      codesign --force --timestamp --options runtime --entitlements "$entitlements" \
        --sign "$identity" "$file"
    fi
  done < <(find "$runtime" -type f -print0)
  codesign --force --timestamp --options runtime --sign "$identity" "$app"
  rm -f "$entitlements"
else
  codesign --force --sign - "$app"
fi
codesign --verify --strict "$app"

say "Making the disk image"
# One name for every version, so "releases/latest/download/U-Cut.dmg" always works.
dmg="$dist/U-Cut.dmg"
staging="$(mktemp -d)"
cp -R "$app" "$staging/U-Cut.app"
ln -s /Applications "$staging/Applications"
rm -f "$dmg"
# hdiutil sometimes finds the disk busy on a shared build machine, so it gets three tries.
for attempt in 1 2 3; do
  hdiutil create -quiet -volname "U-Cut $version" -srcfolder "$staging" -fs APFS -format ULFO "$dmg" && break
  [ "$attempt" -eq 3 ] && { echo "hdiutil couldn't make the disk image." >&2; exit 1; }
  sleep 5
done
rm -rf "$staging"
[ -n "$identity" ] && codesign --force --timestamp --sign "$identity" "$dmg"
(cd "$dist" && shasum -a 256 "$(basename "$dmg")" >"$(basename "$dmg").sha256")

printf '\nApp:   %s (%s)\nImage: %s (%s)\n' \
  "$app" "$(du -sh "$app" | cut -f1)" "$dmg" "$(du -h "$dmg" | cut -f1)"
