#!/usr/bin/env bash
# The ONE release of a branch (owner rule, 2026-08-25).
#
#   bash scripts/release.sh --reviewer <model>
#
# 1. Merges the current branch into main (--no-ff), runs `bun run check` on
#    the merge result, and only then pushes main once. That push is the only
#    Vercel production build and Convex prod deploy for the branch.
# 2. Renames the branch to archive/<branch> locally and on origin.
#
# --reviewer names the independent cross-model reviewer that APPROVED the
# diff (AGENTS.md merge gate). The merge commit records it.
set -euo pipefail

reviewer=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reviewer) reviewer="${2:-}"; shift 2 ;;
    *) echo "release: unknown argument $1"; exit 1 ;;
  esac
done
[ -n "$reviewer" ] || { echo "release: --reviewer <model> is required (independent review approval)."; exit 1; }

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" != "main" ] || { echo "release: you are on main. Check out the branch to release."; exit 1; }
case "$branch" in archive/*) echo "release: $branch is already archived."; exit 1 ;; esac
[ -z "$(git status --porcelain)" ] || { echo "release: working tree is not clean. Commit or stash first."; exit 1; }

git fetch origin --quiet
if [ "$(git rev-parse "$branch")" != "$(git rev-parse "origin/$branch" 2>/dev/null || true)" ]; then
  echo "release: $branch is not pushed to origin, or differs from origin/$branch. Push it first."
  exit 1
fi

git checkout main
git pull --ff-only origin main
base="$(git rev-parse HEAD)"
git merge --no-ff "$branch" -m "[release] $branch (reviewed by $reviewer)"

# The gate must be green BEFORE main is pushed: the push is the production
# build and the Convex prod deploy, and CI on main only starts after it.
echo "release: running bun run check on the merge result before anything is pushed."
if ! bun run check; then
  git reset --hard "$base"
  git checkout "$branch"
  echo "release: check failed. main is unchanged. Fix on $branch and release again."
  exit 1
fi

echo "release: pushing main — this is the ONE production build for $branch."
CAPSULE_RELEASE=1 git push origin main

git branch -m "$branch" "archive/$branch"
git push origin "archive/$branch" ":$branch"
echo "release: done. $branch is now archive/$branch. Start the next branch from main."
