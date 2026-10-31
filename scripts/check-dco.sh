#!/usr/bin/env bash
# Fails if a commit after <base> has no Signed-off-by line from its author.
set -euo pipefail

base="${1:?usage: check-dco.sh <base-ref>}"
status=0

while read -r sha; do
  [ -n "$sha" ] || continue
  author="$(git log -1 --format='%an <%ae>' "$sha")"
  if ! git log -1 --format='%(trailers:key=Signed-off-by,valueonly)' "$sha" | grep -qxF "$author"; then
    echo "Commit ${sha:0:10} has no sign-off from $author. Fix it with: git commit --amend -s" >&2
    status=1
  fi
done < <(git rev-list --no-merges "$base..HEAD")

exit "$status"
