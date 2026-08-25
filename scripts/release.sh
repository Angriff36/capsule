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

branch="$(git symbolic-ref --short -q HEAD || true)"
[ -n "$branch" ] || { echo "release: detached HEAD. Check out the branch to release."; exit 1; }
[ "$branch" != "main" ] || { echo "release: you are on main. Check out the branch to release."; exit 1; }
case "$branch" in archive/*) echo "release: $branch is already archived."; exit 1 ;; esac
[ -z "$(git status --porcelain)" ] || { echo "release: working tree is not clean. Commit or stash first."; exit 1; }

git fetch origin --quiet
branch_sha="$(git rev-parse "$branch")"
remote_archive="$(git ls-remote origin "refs/heads/archive/$branch" | cut -f1 || true)"
remote_branch="$(git ls-remote origin "refs/heads/$branch" | cut -f1 || true)"
# The branch must be on origin at this exact sha — unless origin already
# holds it as archive/<branch> at this sha (a release whose local rename
# did not finish); that case resumes below.
if [ "$remote_branch" != "$branch_sha" ] && ! { [ -z "$remote_branch" ] && [ "$remote_archive" = "$branch_sha" ]; }; then
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
if git show-ref --verify --quiet "refs/heads/archive/$branch"; then
  echo "release: a local branch archive/$branch already exists. Delete or rename it first."
  exit 1
fi
base="$(git rev-parse origin/main)"
proof=.artifacts/release-check-passed

archive_branch() {
  # Remote first (one atomic push), then local. --force-with-lease pins the
  # delete to the released sha: work pushed during the gate is never deleted.
  if [ "$remote_archive" = "$branch_sha" ] && [ -z "$remote_branch" ]; then
    echo "release: origin already has archive/$branch; renaming locally."
  elif ! git push --atomic --force-with-lease="refs/heads/$branch:$branch_sha" origin "$branch_sha:refs/heads/archive/$branch" ":refs/heads/$branch"; then
    git checkout -q "$branch"
    echo "release: main is released, but archiving $branch on origin failed (new commits on it, or a network error). You are back on $branch."
    echo "  Run this again: bash scripts/release.sh --reviewer $reviewer"
    echo "  It resumes the archive without a second release. If $branch gained commits during the gate, it"
    echo "  keeps them: archive only the released sha and keep working on the branch:"
    echo "    git push origin $branch_sha:refs/heads/archive/$branch && git pull --ff-only origin $branch"
    exit 1
  fi
  git checkout -q main
  git branch -m "$branch" "archive/$branch"
  echo "release: done. $branch is now archive/$branch. Start the next branch from main."
}

# Already released once (main push landed, archive did not finish)? Resume
# the archive; never create a second [release] commit for the same branch.
if [ -n "$remote_archive" ] && [ "$remote_archive" != "$branch_sha" ]; then
  echo "release: archive/$branch already exists on origin at a different sha. Delete or rename it first."
  exit 1
fi
if git merge-base --is-ancestor "$branch" origin/main && [ -n "$(git log origin/main -1 --format=%H --grep="^\[release\] $branch ")" ]; then
  echo "release: $branch was already released (a [release] commit for it is on main). Resuming the archive only."
  archive_branch
  exit 0
fi

# Leave main first, then move it: `git branch -f` on a branch that is not
# checked out always works, and a failed move is loud.
restore_main_and_branch() {
  git checkout -q -f "$branch"
  git branch -f main "$base"
  rm -f "$proof"
  if [ "$(git rev-parse main)" != "$base" ]; then
    echo "release: WARNING — could not move local main back to $base. Run: git branch -f main origin/main"
  fi
}

abort_release() {
  echo ""
  echo "release: interrupted. Restoring main and returning to $branch."
  git merge --abort 2>/dev/null || true
  restore_main_and_branch
  exit 130
}
trap abort_release INT TERM

git checkout -q main
subject="[release] $branch (reviewed by $reviewer)"
if git merge-base --is-ancestor "$branch" main; then
  # Already on main (e.g. a GitHub-side merge that never deployed). A real
  # [release] commit is still required: Vercel builds main only for one.
  if ! git commit -q --allow-empty -m "$subject"; then
    restore_main_and_branch
    echo "release: could not create the release commit (see above). main is unchanged."
    exit 1
  fi
elif ! git merge --no-ff "$branch" -m "$subject"; then
  git merge --abort || true
  restore_main_and_branch
  echo "release: merge conflict with main. Merge main into $branch, resolve, push, and release again."
  exit 1
fi

# There is no flag to skip this. The pre-push hook needs the proof file
# below, stamped with the exact commit that passed, or it refuses main.
echo "release: running bun run check on the merge result before anything is pushed."
if ! bun run check; then
  git checkout -q -- .
  restore_main_and_branch
  echo "release: check failed. main is unchanged. Fix on $branch and release again."
  exit 1
fi
# The gate must not have changed the tree (e.g. proof:emit rewriting
# generated/proof): the commit pushed must be the exact tree that passed.
if [ -n "$(git status --porcelain)" ]; then
  git status --short | head -20
  git checkout -q -- .
  restore_main_and_branch
  echo "release: bun run check changed tracked files (above). Run it on $branch, commit the result, push, and release again."
  exit 1
fi
mkdir -p .artifacts
git rev-parse HEAD > "$proof"

trap - INT TERM
echo "release: pushing main — this is the ONE production build for $branch."
if ! CAPSULE_RELEASE=1 git push origin main; then
  rm -f "$proof"
  # Ask the server directly; a cached origin/main could be stale.
  remote_main="$(git ls-remote origin refs/heads/main 2>/dev/null | cut -f1 || true)"
  if [ "$remote_main" = "$(git rev-parse main)" ]; then
    echo "release: push reported an error but origin has the release. Continuing."
  elif [ -z "$remote_main" ]; then
    echo "release: push failed and origin cannot be reached. State is UNKNOWN."
    echo "  Local main holds the unpushed release commit $(git rev-parse main). When origin is back:"
    echo "  git ls-remote origin refs/heads/main"
    echo "  If it prints that sha, the release LANDED. Finish the archive (no second release):"
    echo "    git checkout $branch && bash scripts/release.sh --reviewer $reviewer"
    echo "  If it prints a different sha, the release did NOT land. Reset and release again:"
    echo "    git checkout $branch && git branch -f main origin/main"
    exit 1
  else
    restore_main_and_branch
    echo "release: push to main failed (see above). main is unchanged. Fix and release again."
    exit 1
  fi
fi
rm -f "$proof"

archive_branch
