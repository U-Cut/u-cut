#!/usr/bin/env bash
# Installs U-Cut. Run it with:
#   curl -fsSL https://raw.githubusercontent.com/mayank29deo/U-Cut/main/install.sh | bash
#
# Change where it goes with UCUT_DIR (the code), UCUT_BIN (the `ucut` command) and UCUT_APPS
# (the Mac app).
set -euo pipefail

repo="${UCUT_REPO:-https://github.com/mayank29deo/U-Cut.git}"
dir="${UCUT_DIR:-$HOME/.u-cut}"
bin="${UCUT_BIN:-$HOME/.local/bin}"
apps="${UCUT_APPS:-$HOME/Applications}"
minimum_node=22

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
stop() { printf '\n%s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

node_is_new_enough() {
  have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$minimum_node" ]
}

need_tools() {
  local missing=()
  node_is_new_enough || missing+=(node)
  have ffmpeg || missing+=(ffmpeg)
  have git || missing+=(git)
  [ "${#missing[@]}" -eq 0 ] && return

  if have brew; then
    say "Installing ${missing[*]} with Homebrew"
    brew install "${missing[@]}"
  elif [ "$(uname)" = "Darwin" ]; then
    stop "U-Cut needs ${missing[*]}. Install Homebrew from https://brew.sh, then run this again."
  else
    stop "U-Cut needs ${missing[*]}. Install them with your package manager, then run this again."
  fi
}

pnpm_run() {
  if have corepack; then
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm "$@"
  else
    npx --yes pnpm@12.16.1 "$@"
  fi
}

say "Installing U-Cut into $dir"
need_tools

if [ -d "$dir/.git" ]; then
  git -C "$dir" pull --ff-only --quiet
else
  git clone --quiet --depth 1 "$repo" "$dir"
fi

cd "$dir"
say "Installing what U-Cut depends on"
pnpm_run install --frozen-lockfile

say "Building"
pnpm_run build

if [ "$(uname)" = "Darwin" ] && have swift; then
  say "Building the photo sorter"
  swift build --package-path apps/mac -c release --product ucut-vision >/dev/null 2>&1 ||
    echo "The sorter didn't build. U-Cut still works, without sorting by scene."
fi

say "Getting the rendering browser"
node packages/engine/dist/bin.js setup

mkdir -p "$bin"
cat > "$bin/ucut" <<WRAPPER
#!/usr/bin/env bash
exec node "$dir/packages/engine/dist/bin.js" "\$@"
WRAPPER
chmod +x "$bin/ucut"

if [ "$(uname)" = "Darwin" ] && have swift; then
  say "Building the Mac app"
  if scripts/bundle-app.sh >/dev/null 2>&1; then
    mkdir -p "$apps"
    rm -rf "$apps/U-Cut.app"
    cp -R dist/U-Cut.app "$apps/U-Cut.app"
    echo "Added U-Cut to $apps"
  else
    echo "The Mac app didn't build. U-Cut still works in your browser."
  fi
fi

node packages/engine/dist/bin.js doctor

say "U-Cut is ready."
case ":$PATH:" in
  *":$bin:"*) echo "Start it with: ucut" ;;
  *) echo "Start it with: $bin/ucut" ;;
esac
