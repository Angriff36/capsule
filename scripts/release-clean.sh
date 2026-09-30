#!/usr/bin/env bash
# Release from a private clean copy of the repository.
#
# The Ralph loops edit files in the working checkout all the time; a release
# run there checks their half-finished edits and fails at random (2026-09-24).
# This script keeps a separate copy at $CAPSULE_RELEASE_DIR (default
# ~/.capsule-release), resets it to the pushed origin/dev, and runs the normal
# scripts/deploy-production.sh from it. The working checkout is not touched.
# Arguments pass through (for example --no-review or --reviewer <model>).
#
# Only pushed work is released: commits that exist only in the working
# checkout are listed and left out.
#
# FROZEN CANDIDATE: the release freezes one commit when it starts - origin/dev
# at that moment, or --candidate <sha>. Review, gate, merge and deploy all use
# that commit; work that lands on dev afterwards waits for the next release.
# To fix a rejected review, commit the fix on top of the frozen candidate,
# push it (any branch), and run this again with --candidate <fix sha>.
set -euo pipefail

say() { echo "release-clean: $*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGIN_URL="$(git -C "$REPO_ROOT" remote get-url origin)"
COPY="${CAPSULE_RELEASE_DIR:-$HOME/.capsule-release}"

git -C "$REPO_ROOT" fetch -q origin
candidate=""
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --candidate) candidate="${2:-}"; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
[ -n "$candidate" ] || candidate="$(git -C "$REPO_ROOT" rev-parse origin/dev)"
unpushed="$(git -C "$REPO_ROOT" log --oneline origin/dev..dev 2>/dev/null || true)"
if [ -n "$unpushed" ]; then
  say "these local dev commits are not pushed and will NOT be released:"
  echo "$unpushed" | sed 's/^/  /'
fi

if [ ! -d "$COPY/.git" ]; then
  say "making the private copy at $COPY (first run only)"
  git clone -q --branch dev "$ORIGIN_URL" "$COPY"
fi

cd "$COPY"
git fetch -q origin
candidate="$(git rev-parse --verify -q "$candidate^{commit}" || true)"
[ -n "$candidate" ] || { say "the release candidate is not a pushed commit"; exit 1; }
git checkout -q -f -B dev "$candidate"
# Remove anything a previous run left behind; keep installed packages.
git clean -q -fdx -e node_modules
git branch -f main origin/main >/dev/null
say "releasing candidate $(git log -1 --format='%H %s')"

bun install >/dev/null
bash scripts/deploy-production.sh --candidate "$candidate" ${args[@]+"${args[@]}"}
