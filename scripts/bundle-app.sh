#!/usr/bin/env bash
# Builds apps/mac in release mode and wraps it into dist/U-Cut.app. Needs no Xcode.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package="$root/apps/mac"
app="$root/dist/U-Cut.app"
version="$(node -p "require('$root/packages/engine/package.json').version")"

swift build --package-path "$package" -c release --product UCut
bin_dir="$(swift build --package-path "$package" -c release --show-bin-path)"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp "$bin_dir/UCut" "$app/Contents/MacOS/UCut"

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>U-Cut</string>
  <key>CFBundleDisplayName</key><string>U-Cut</string>
  <key>CFBundleIdentifier</key><string>io.github.mayank29deo.ucut</string>
  <key>CFBundleExecutable</key><string>UCut</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSHighResolutionCapable</key><true/>
  <key>UCutRoot</key><string>$root</string>
</dict>
</plist>
PLIST

codesign --force --sign - "$app"
echo "Built $app"
