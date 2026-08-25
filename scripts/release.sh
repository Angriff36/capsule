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
# diff (AGENTS.md merge gate). The merge commit records it. The merge
# subject starts with "[release]" — vercel.json builds main ONLY for such
# commits, so a merge made on GitHub (PR button, auto-merge) never deploys.
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
# Local main must be exactly origin/main: nothing is ever committed to main
# by hand, so any extra local commit is stray and must not ride this release.
if [ "$(git rev-parse main)" != "$(git rev-parse origin/main)" ]; then
  echo "release: local main differs from origin/main. Reset it first:"
  echo "  git branch -f main origin/main"
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/archive/$branch" || git show-ref --verify --quiet "refs/remotes/origin/archive/$branch"; then
  echo "release: archive/$branch already exists. Delete or rename it first."
  exit 1
fi
base="$(git rev-parse origin/main)"
proof=.artifacts/release-check-passed

back_to_branch() {
  git checkout -q "$branch"
  rm -f "$proof"
}

git checkout -q main
subject="[release] $branch (reviewed by $reviewer)"
if git merge-base --is-ancestor "$branch" main; then
  # Already on main (e.g. a GitHub-side merge that never deployed). A real
  # [release] commit is still required: Vercel builds main only for one.
  git commit -q --allow-empty -m "$subject"
elif ! git merge --no-ff "$branch" -m "$subject"; then
  git merge --abort || true
  back_to_branch
  echo "release: merge conflict with main. Merge main into $branch, resolve, push, and release again."
  exit 1
fi

# There is no flag to skip this. The pre-push hook needs the proof file
# below, stamped with the exact commit that passed, or it refuses main.
echo "release: running bun run check on the merge result before anything is pushed."
if ! bun run check; then
  git reset -q --hard "$base"
  back_to_branch
  echo "release: check failed. main is unchanged. Fix on $branch and release again."
  exit 1
fi
# The gate must not have changed the tree (e.g. proof:emit rewriting
# generated/proof): the commit pushed must be the exact tree that passed.
if [ -n "$(git status --porcelain)" ]; then
  git status --short | head -20
  git reset -q --hard "$base"
  back_to_branch
  echo "release: bun run check changed tracked files (above). Run it on $branch, commit the result, push, and release again."
  exit 1
fi
mkdir -p .artifacts
git rev-parse HEAD > "$proof"

echo "release: pushing main — this is the ONE production build for $branch."
if ! CAPSULE_RELEASE=1 git push origin main; then
  rm -f "$proof"
  git fetch origin --quiet || true
  if [ "$(git rev-parse origin/main)" = "$(git rev-parse main)" ]; then
    echo "release: push reported an error but origin/main has the release. Continuing."
  else
    git reset -q --hard "$base"
    back_to_branch
    echo "release: push to main failed (see above). main is unchanged. Fix and release again."
    exit 1
  fi
fi
rm -f "$proof"

# Remote first (one atomic push), then local. If this push fails the release
# is already live; finish by hand with the two commands printed.
if ! git push --atomic origin "$branch:archive/$branch" ":$branch"; then
  echo "release: main is released, but archiving $branch on origin failed. Finish by hand:"
  echo "  git push --atomic origin $branch:archive/$branch :$branch"
  echo "  git branch -m $branch archive/$branch"
  exit 1
fi
git branch -m "$branch" "archive/$branch"
echo "release: done. $branch is now archive/$branch. Start the next branch from main."
