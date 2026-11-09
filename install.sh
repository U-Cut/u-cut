#!/usr/bin/env bash
# Installs U-Cut. Run it with:
#   curl -fsSL https://raw.githubusercontent.com/U-Cut/u-cut/main/install.sh | bash
#
# Change where it goes with UCUT_DIR (the code), UCUT_BIN (the `ucut` command) and UCUT_APPS
# (the Mac app).
set -euo pipefail

repo="${UCUT_REPO:-https://github.com/U-Cut/u-cut.git}"
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

# Homebrew's installer asks people to add it to their PATH, and many skip that step.
for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if ! have brew && [ -x "$brew_path" ]; then eval "$("$brew_path" shellenv)"; fi
done

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
if [ -n "${UCUT_NO_SPEECH:-}" ]; then
  node packages/engine/dist/bin.js setup
else
  # whisper-cpp and the 465 MB model give screen recordings their captions.
  have whisper-cli || { have brew && brew install whisper-cpp; } || true
  # uv runs the voice for written reels, which downloads the first time someone asks for it.
  have uv || { have brew && brew install uv; } || true
  node packages/engine/dist/bin.js setup --speech ||
    echo "The speech model didn't install. Demos still work, without captions."
fi

mkdir -p "$bin"
# Version managers hand out temporary paths, so this asks Node where it really is.
node_bin="$(node -p process.execPath)"
# Assistants such as Claude Desktop start this without your shell's settings, so it carries the
# paths to Node, FFmpeg and Homebrew itself, and says where it lives for the setup snippets.
cat > "$bin/ucut" <<WRAPPER
#!/usr/bin/env bash
export PATH="$(dirname "$node_bin"):/opt/homebrew/bin:/usr/local/bin:\$PATH"
export UCUT_LAUNCHER="$bin/ucut"
exec "$node_bin" "$dir/packages/engine/dist/bin.js" "\$@"
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
  *)
    # A stock Mac doesn't look in ~/.local/bin, so new Terminal windows are told to.
    profile="$HOME/.zprofile"
    [ "$(basename "${SHELL:-zsh}")" = "bash" ] && profile="$HOME/.bash_profile"
    if ! grep -qs "$bin" "$profile"; then
      printf '\n# Added by the U-Cut installer\nexport PATH="%s:$PATH"\n' "$bin" >> "$profile"
      echo "Added $bin to your PATH in $profile."
    fi
    echo "Start it with: ucut  (in a new Terminal window), or $bin/ucut now"
    ;;
esac
