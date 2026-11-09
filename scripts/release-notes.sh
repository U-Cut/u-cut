#!/usr/bin/env bash
# Prints one version's section of CHANGELOG.md, for its GitHub release.
#
#   scripts/release-notes.sh 0.1.0
set -euo pipefail
version="${1:?Give a version, such as 0.1.0}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
notes="$(awk -v heading="## [$version]" '
  index($0, heading) == 1 { found = 1; next }
  found && /^## \[/ { exit }
  found { print }
' "$root/CHANGELOG.md")"
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  echo "CHANGELOG.md has no section for $version. Add one under \"## [$version]\"." >&2
  exit 1
fi
printf '%s\n' "$notes"
