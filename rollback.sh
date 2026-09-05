#!/bin/bash
# rollback.sh — one-command escape hatch when the loop digs a hole.
# Hard-resets the current branch to the most recent git tag whose commit still
# passes the test command, and summarizes the iterations that get discarded.
#
# loop.sh's convention (PROMPT_build.md) tags every green build, so the tags are
# a trail of known-good commits. When several bad iterations pile up faster than
# you can `git reset` by hand, this walks the tags newest-first, runs the tests
# at each, and resets to the first that passes.
#
# Usage: ./rollback.sh [--test-cmd "cmd"] [--dry-run] [--yes]
#   --test-cmd "cmd"   Command that gates a tag (default: TEST_CMD from .ralph.env)
#   --dry-run          Find the target tag and print the summary; change nothing.
#   --yes, -y          Skip the confirmation prompt before git reset --hard.
#
# Examples:
#   ./rollback.sh                     # reset to newest green tag (asks first)
#   ./rollback.sh --dry-run           # show what would be discarded, change nothing
#   ./rollback.sh --test-cmd "make check" --yes
#
# Tags are tried nearest-to-HEAD first by commit ancestry (not wall-clock date,
# which ties or lies after rebases), so this works with loop.sh's semver tags
# (0.0.1, 0.0.2, ...) or any other naming scheme — it never assumes a tag-name
# pattern, only "which known-good commit behind us is closest".

set -u

TEST_CMD_OVERRIDE=""
DRY_RUN=0
ASSUME_YES=0
while [ $# -gt 0 ]; do
    case "$1" in
        --test-cmd) TEST_CMD_OVERRIDE="$2"; shift 2 ;;
        --test-cmd=*) TEST_CMD_OVERRIDE="${1#*=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --yes|-y) ASSUME_YES=1; shift ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# Load project config (TEST_CMD) the same way loop.sh does.
if [ -f ".ralph.env" ]; then
    set -a
    . ./.ralph.env
    set +a
fi
TEST_CMD="${TEST_CMD_OVERRIDE:-${TEST_CMD:-}}"
if [ -z "$TEST_CMD" ]; then
    echo "Error: no test command. Set TEST_CMD in .ralph.env or pass --test-cmd \"cmd\"."
    exit 1
fi

# Must be inside a git repo.
git rev-parse --git-dir >/dev/null 2>&1 || { echo "Error: not a git repository"; exit 1; }

# Refuse to run with a dirty tree — a hard reset would silently discard
# uncommitted work, and we checkout tags to test them.
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: working tree not clean. Commit or stash changes before rolling back."
    exit 1
fi

# Remember where we started so we can restore it: a branch name, or the commit
# sha if we're on a detached HEAD.
ORIG_BRANCH=$(git branch --show-current)
ORIG_HEAD=$(git rev-parse HEAD)
ORIG_REF="${ORIG_BRANCH:-$ORIG_HEAD}"

# Candidate tags that are ancestors of HEAD, ordered closest-to-HEAD first.
# "Most recent good tag" is the nearest known-good commit behind us, which is
# ancestry distance (commits between the tag and HEAD) — not tag date. Tags on
# other branches aren't ancestors, so they're excluded automatically.
CANDIDATES=$(
    git tag | while IFS= read -r tag; do
        [ -z "$tag" ] && continue
        if git merge-base --is-ancestor "$tag" HEAD 2>/dev/null; then
            printf '%s\t%s\n' "$(git rev-list --count "$tag..HEAD")" "$tag"
        fi
    done | sort -n
)
if [ -z "$CANDIDATES" ]; then
    echo "Error: no tags are ancestors of HEAD — nothing to roll back to."
    exit 1
fi

# Testing a tag means checking it out; if we're interrupted mid-run don't leave
# the user stranded on a detached HEAD — restore the original ref on exit.
restore() { git checkout --quiet "$ORIG_REF" 2>/dev/null; }
trap restore EXIT

echo "Testing tags newest-first with: $TEST_CMD"

WINNER=""
while IFS=$'\t' read -r _dist tag; do
    [ -z "$tag" ] && continue
    git checkout --quiet --detach "$tag" 2>/dev/null || { echo "  $tag — checkout failed, skipping"; continue; }
    if ( eval "$TEST_CMD" ) >/dev/null 2>&1; then
        echo "  $tag — PASS"
        WINNER="$tag"
        break
    fi
    echo "  $tag — fail"
done <<< "$CANDIDATES"

# Back to where we started before doing anything destructive.
restore
trap - EXIT

if [ -z "$WINNER" ]; then
    echo "No tag passed '$TEST_CMD'. Nothing to roll back to."
    exit 1
fi

WINNER_SHA=$(git rev-parse "$WINNER")
if [ "$WINNER_SHA" = "$ORIG_HEAD" ]; then
    echo "Newest passing tag ($WINNER) is already the current HEAD — nothing to discard."
    exit 0
fi

# Summarize what a reset would discard. rev-list ..HEAD counts commits reachable
# from HEAD but not the tag; correct even if history isn't strictly linear.
DISCARD_COUNT=$(git rev-list --count "$WINNER..$ORIG_HEAD")
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Rollback target: $WINNER ($WINNER_SHA)"
echo "Current HEAD:    $ORIG_REF ($ORIG_HEAD)"
echo "Commits to discard: $DISCARD_COUNT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git log --oneline "$WINNER..$ORIG_HEAD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$DRY_RUN" -eq 1 ]; then
    echo "Dry run — no reset performed. Re-run without --dry-run to reset to $WINNER."
    exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
    read -p "Hard-reset $ORIG_REF to $WINNER, discarding $DISCARD_COUNT commit(s)? [y/N] " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && { echo "Aborted."; exit 1; }
fi

git reset --hard "$WINNER"
echo "Reset $ORIG_REF to $WINNER. Discarded $DISCARD_COUNT commit(s) (recoverable via 'git reflog')."
