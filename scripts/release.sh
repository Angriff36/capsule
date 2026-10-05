#!/usr/bin/env bash
# The ONE release of a branch (owner rule, 2026-08-25).
#
#   bash scripts/release.sh --reviewer <model> | --no-review
# Or overlap independent review with validation:
#   bash scripts/release.sh --prepare --reviewer <model>
#   bash scripts/release.sh --publish --reviewer <model>  # after APPROVE
#
# 1. Merges the current branch into main (--no-ff), runs `bun run check` on
#    the merge result, and only then pushes main once. That push is the only
#    Vercel production build and Convex prod deploy for the branch.
# 2. Renames the branch to archive/<branch> locally and on origin. The shared
#    `dev` branch is the exception (owner rule, 2026-09-20): it is permanent,
#    so it is moved to the release commit and never archived.
#
# --reviewer names the independent cross-model reviewer that APPROVED the
# diff (AGENTS.md merge gate). The merge commit records it. --no-review
# releases a change the merge gate does not send to review (Ryan, 2026-09-24:
# "dont need to do another code review for such a small change"). The merge
# subject starts with "[release]" — vercel.json builds main ONLY for such
# commits, so a merge made on GitHub (PR button, auto-merge) never deploys.
set -euo pipefail

reviewer=""
no_review=0
candidate=""
mode="release"
while [ $# -gt 0 ]; do
  case "$1" in
    --reviewer) reviewer="${2:-}"; shift 2 ;;
    --prepare|--publish)
      [ "$mode" = "release" ] || { echo "release: choose either --prepare or --publish."; exit 1; }
      mode="${1#--}"; shift ;;
    --no-review) no_review=1; shift ;;
    # The frozen release candidate (scripts/release-clean.sh, deploy-production.sh):
    # the exact commit that was reviewed. The branch must be checked out at it;
    # commits pushed to the branch after it wait for the next release.
    --candidate) candidate="${2:-}"; shift 2 ;;
    *) echo "release: unknown argument $1"; exit 1 ;;
  esac
done
[ -n "$reviewer" ] || [ "$no_review" = 1 ] || { echo "release: pass --reviewer <model> (the approving reviewer) or --no-review."; exit 1; }
rerun_args="--no-review"
[ -z "$reviewer" ] || rerun_args="--reviewer $reviewer"
[ "$mode" = "release" ] || { [ -n "$reviewer" ] && [ "$no_review" = 0 ]; } || { echo "release: --prepare/--publish require --reviewer and independent APPROVE before publishing."; exit 1; }

proof=.artifacts/release-check-passed
prepared=.artifacts/release-prepared
branch="$(git symbolic-ref --short -q HEAD || true)"
[ -n "$branch" ] || { echo "release: detached HEAD. Check out the branch to release."; exit 1; }
if [ "$mode" = "publish" ]; then
  [ "$branch" = "main" ] && [ -f "$prepared" ] || { echo "release: --publish requires main and a successful --prepare."; exit 1; }
  branch="$(sed -n '1p' "$prepared")"
  prepared_branch_sha="$(sed -n '2p' "$prepared")"
  prepared_base="$(sed -n '3p' "$prepared")"
  prepared_reviewer="$(sed -n '4p' "$prepared")"
  prepared_sha="$(sed -n '5p' "$prepared")"
  prepared_candidate="$(sed -n '6p' "$prepared")"
  if [ -n "$candidate" ]; then
    candidate="$(git rev-parse --verify "$candidate^{commit}")"
    [ "$candidate" = "$prepared_candidate" ] || { echo "release: frozen candidate differs from preparation."; exit 1; }
  fi
  candidate="$prepared_candidate"
  [ "$reviewer" = "$prepared_reviewer" ] || { echo "release: reviewer differs from the prepared candidate."; exit 1; }
  [ "$(git rev-parse HEAD)" = "$prepared_sha" ] && [ "$(cat "$proof" 2>/dev/null || true)" = "$prepared_sha" ] || {
    echo "release: candidate changed or validation did not pass. Prepare and review again."; exit 1;
  }
else
  [ "$branch" != "main" ] || { echo "release: you are on main. Use --publish for a validated candidate, or check out the branch to release."; exit 1; }
fi
case "$branch" in archive/*) echo "release: $branch is already archived."; exit 1 ;; esac
[ -z "$(git status --porcelain)" ] || { echo "release: working tree is not clean. Commit or stash first."; exit 1; }

git fetch origin --quiet
branch_sha="$(git rev-parse "$branch")"
remote_archive="$(git ls-remote origin "refs/heads/archive/$branch" | cut -f1 || true)"
remote_branch="$(git ls-remote origin "refs/heads/$branch" | cut -f1 || true)"
if [ -n "$candidate" ]; then
  # Frozen candidate: release exactly this commit. It must be pushed (reachable
  # from a remote branch); the branch may have moved on since it was frozen.
  candidate="$(git rev-parse --verify -q "$candidate^{commit}" || true)"
  [ -n "$candidate" ] || { echo "release: the release candidate is not a commit here."; exit 1; }
  [ "$branch_sha" = "$candidate" ] || { echo "release: $branch is at $branch_sha, not at the frozen release candidate $candidate."; exit 1; }
  [ -n "$(git branch -r --contains "$candidate" 2>/dev/null)" ] || { echo "release: the release candidate $candidate is not pushed to origin. Push it first."; exit 1; }
# The branch must be on origin at this exact sha — unless origin already
# holds it as archive/<branch> at this sha (a release whose local rename
# did not finish); that case resumes below.
elif [ "$remote_branch" != "$branch_sha" ] && ! { [ -z "$remote_branch" ] && [ "$remote_archive" = "$branch_sha" ]; }; then
  echo "release: $branch is not pushed to origin, or differs from origin/$branch. Push it first."
  exit 1
fi
# Local main must be exactly origin/main: nothing is ever committed to main
# by hand, so any extra local commit is stray and must not ride this release.
if [ "$mode" = "publish" ]; then
  [ "$(git rev-parse origin/main)" = "$prepared_base" ] && [ "$branch_sha" = "$prepared_branch_sha" ] || {
    echo "release: main or the source branch advanced. Prepare and review a new merge; this candidate cannot be published."; exit 1;
  }
elif [ "$(git rev-parse main)" != "$(git rev-parse origin/main)" ]; then
  echo "release: local main differs from origin/main. Reset it first:"
  echo "  git branch -f main origin/main"
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/archive/$branch"; then
  echo "release: a local branch archive/$branch already exists. Delete or rename it first."
  exit 1
fi
base="$(git rev-parse origin/main)"

archive_branch() {
  # The shared `dev` branch (owner rule, 2026-09-20) is permanent: every agent
  # works on it and it is never archived. Move it to the release commit, so
  # the next work starts from main. Commits pushed to dev during the gate stay.
  if [ "$branch" = "dev" ]; then
    git checkout -q dev
    if ! { git merge -q --ff-only main && { git push -q origin dev || { git pull -q --no-rebase --no-edit origin dev && git push -q origin dev; }; }; }; then
      echo "release: main is released, but dev could not be moved to it. You are on dev. Run: git pull --no-rebase origin dev && git merge main && git push origin dev"
      exit 1
    fi
    echo "release: done. dev is at the release commit and stays the shared work branch."
    return 0
  fi
  # Remote first (one atomic push), then local. --force-with-lease pins the
  # delete to the released sha: work pushed during the gate is never deleted.
  if [ "$remote_archive" = "$branch_sha" ] && [ -z "$remote_branch" ]; then
    echo "release: origin already has archive/$branch; renaming locally."
  elif ! git push --atomic --force-with-lease="refs/heads/$branch:$branch_sha" origin "$branch_sha:refs/heads/archive/$branch" ":refs/heads/$branch"; then
    git checkout -q "$branch"
    echo "release: main is released, but archiving $branch on origin failed (new commits on it, or a network error). You are back on $branch."
    echo "  Run this again: bash scripts/release.sh $rerun_args"
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
# Production Convex is self-hosted on the Linux box: a release builds the UI
# only. The backend handoff (docs/operations/production-backend-deploy.md);
# $1 is the [release] commit on main. Every path that ends a release prints it.
backend_handoff() {
  echo "release: BACKEND HANDOFF. Vercel built the UI only. If this release changed manifests or convex/,"
  echo "  the owner runs this ON THE LINUX PRODUCTION BOX (never on this machine):"
  echo "    bash scripts/deploy-backend.sh --expect $1"
  echo "  Add --verify <query>,<query> for queries that this release added."
  echo "  scripts/deploy-production.sh does this step by itself; when it started this release, do nothing."
}

released_sha="$(git log origin/main -1 --format=%H --grep="^\[release\] $branch " || true)"
if git merge-base --is-ancestor "$branch" origin/main && [ -n "$released_sha" ]; then
  if [ "$mode" = "prepare" ]; then
    echo "release: $branch is already released; nothing to prepare. No remote writes performed."
    exit 0
  fi
  echo "release: $branch was already released (a [release] commit for it is on main). Resuming the archive only."
  backend_handoff "$released_sha"
  archive_branch
  exit 0
fi

back_to_branch() {
  git checkout -q "$branch"
  rm -f "$proof" "$prepared"
}

abort_release() {
  echo ""
  echo "release: interrupted. Restoring main and returning to $branch."
  git merge --abort 2>/dev/null || true
  git reset -q --hard "$base"
  back_to_branch
  exit 130
}
trap abort_release INT TERM

# PR12-01 / AC-028 — deployment config pre-flight. Shell env only
# (--no-env-files): a local development .env.local must never impersonate
# production config. The hard gate for the real production env runs inside
# scripts/vercel-build.sh (VERCEL_ENV=production). set -e aborts here,
# before any merge, when the release shell carries conflicting values.
# Bun auto-loads .env/.env.local into process.env before the script runs, so
# --no-env-files alone still sees the dev values on a developer machine.
# Point Bun at an empty env file so only the real shell env is visible.
mkdir -p .artifacts && : > .artifacts/release-empty.env
bun --env-file=.artifacts/release-empty.env scripts/check-deployment-config.ts --environment production --no-env-files

if [ "$mode" != "publish" ]; then
rm -f "$proof" "$prepared"
git checkout -q main
if [ -n "$reviewer" ]; then
  subject="[release] $branch (reviewed by $reviewer)"
else
  subject="[release] $branch (no review needed)"
fi
# Production records the exact commit that was reviewed and released.
body="Release-Candidate: $branch_sha"
if git merge-base --is-ancestor "$branch" main; then
  # Already on main (e.g. a GitHub-side merge that never deployed). A real
  # [release] commit is still required: Vercel builds main only for one.
  if ! git commit -q --allow-empty -m "$subject" -m "$body"; then
    git reset -q --hard "$base"
    back_to_branch
    echo "release: could not create the release commit (see above). main is unchanged."
    exit 1
  fi
elif ! git merge --no-ff "$branch" -m "$subject" -m "$body"; then
  git merge --abort || true
  back_to_branch
  echo "release: merge conflict with main. Merge main into $branch, resolve, push, and release again."
  exit 1
fi

# Review this exact candidate while the full gate runs. No remote writes are
# performed by --prepare, and no passing proof exists until the gate finishes.
merge_candidate="$(git rev-parse HEAD)"
printf '%s\n' "$branch" "$branch_sha" "$base" "$reviewer" "$merge_candidate" "$candidate" > "$prepared"
echo "release: candidate $merge_candidate; review its diff against $base while validation runs."

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
if [ "$(git rev-parse HEAD)" != "$merge_candidate" ]; then
  rm -f "$proof" "$prepared"
  echo "release: HEAD changed during validation. Nothing pushed; prepare and review the new candidate."
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  git status --short | head -20
  git reset -q --hard "$base"
  back_to_branch
  echo "release: bun run check changed tracked files (above). Run it on $branch, commit the result, push, and release again."
  exit 1
fi
mkdir -p .artifacts
git rev-parse HEAD > "$proof"
fi

trap - INT TERM
if [ "$mode" = "prepare" ]; then
  echo "release: candidate validated. After independent APPROVE, run: bash scripts/release.sh --publish --reviewer $reviewer"
  exit 0
fi
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
    echo "    git checkout $branch && bash scripts/release.sh $rerun_args"
    echo "  If it prints a different sha, the release did NOT land. Reset and release again:"
    echo "    git checkout $branch && git branch -f main origin/main"
    exit 1
  else
    git reset -q --hard "$base"
    back_to_branch
    echo "release: push to main failed (see above). main is unchanged. Fix and release again."
    exit 1
  fi
fi
rm -f "$proof" "$prepared"

# PR13-06 / AC-030 — release receipt for THIS merge. The production build
# takes minutes; gather with a bounded wait. Partial stays partial and is
# printed loudly: the push already shipped, so the archive is not withheld
# for a partial receipt (that would hide state, not unship it). Legs verify
# only when their inputs exist (CAPSULE_RELEASE_URL for the canonical URL,
# Vercel CLI/token for inspect + env pull, CAPSULE_API_KEY for the
# authenticated workflow); missing inputs keep the receipt honestly partial.
# scripts/deploy-production.sh sets CAPSULE_RECEIPT_AFTER_BACKEND: it takes
# the receipt itself once the self-hosted backend is deployed (#382).
if [ -z "${CAPSULE_RECEIPT_AFTER_BACKEND:-}" ]; then
  bun scripts/release-receipt.ts \
    --sha "$(git rev-parse main)" \
    --wait "${CAPSULE_RELEASE_WAIT:-600}" \
    || echo "release: receipt gathering failed (see above); the release itself already shipped."
fi

backend_handoff "$(git rev-parse main)"
archive_branch
