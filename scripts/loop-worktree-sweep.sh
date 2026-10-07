#!/bin/bash
# Sweep .loop-worktrees: a worktree is DISPOSABLE once its branch is safely
# on origin (the branch survives; the tree does not need to). Dead attempts
# (no unique commits) are removed outright. Only worktrees holding UNPUSHED
# commits are kept, and those are listed loudly so they cannot get lost.
# Run from the repo root. Deepest paths first (nested worktrees exist, sadly).
# Two worktrees are always KEPT even though their commits are already on dev
# (loop-publish.ps1 pushes every batch commit, so "0 ahead" is normal for them):
# any worktree a hand-off in .loop-worktrees/_handoff names (the lander still has
# to read it), and the newest loop/batch-* worktree (the maker builds all day and
# answers the daily review in it; the lander removes it after APPROVE).
cd "$(git rev-parse --show-toplevel)" || exit 1
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
protected=" "
for h in "$main_root"/.loop-worktrees/_handoff/*.json; do
  [ -f "$h" ] || continue
  b=$(tr -d '\r\n' < "$h" | grep -o '"branch"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  r=$(tr -d '\r\n' < "$h" | grep -o '"runId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  [ -n "$b" ] && protected="$protected$b "
  [ -n "$r" ] && protected="${protected}loop/$r "
done
newest_batch=$(git worktree list --porcelain | awk '/^branch refs\/heads\/loop\/batch-/{sub("refs/heads/","",$2); print $2}' | sort | tail -n 1)
[ -n "$newest_batch" ] && protected="$protected$newest_batch "
kept=0; removed=0
git worktree list --porcelain | awk '/^worktree /{print $2}' | grep "/.loop-worktrees/" | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2- | while read -r wt; do
  branch=$(git -C "$wt" branch --show-current 2>/dev/null)
  # Other agent sessions also park worktrees here (detached, fix/*, archive/*).
  # The sweep owns ONLY loop/* branches, and never deletes uncommitted files.
  case "$branch" in
    loop/*) ;;
    *) echo "SKIP (not a loop worktree): $wt [${branch:-detached}]"; continue ;;
  esac
  if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
    echo "KEEP (uncommitted files): $wt [$branch]"; continue
  fi
  case "$protected" in
    *" $branch "*) echo "KEEP (named in a hand-off or the current batch): $wt [$branch]"; continue ;;
  esac
  ahead=$(git rev-list --count origin/dev.."$branch" 2>/dev/null || echo "?")
  remote=$(git ls-remote --heads origin "$branch" 2>/dev/null | awk '{print $1}')
  local_tip=$(git rev-parse "$branch" 2>/dev/null)
  if [ "$ahead" = "0" ] || [ "$ahead" = "?" ]; then
    echo "REMOVE (dead attempt, no unique commits): $wt"
    git worktree remove --force "$wt" 2>/dev/null && git branch -D "$branch" 2>/dev/null
  elif [ -n "$remote" ] && [ "$remote" = "$local_tip" ]; then
    echo "REMOVE (branch safe on origin): $wt"
    git worktree remove --force "$wt" 2>/dev/null && git branch -D "$branch" 2>/dev/null
  else
    echo "KEEP (UNPUSHED commits - push or salvage): $wt [$branch ahead=$ahead]"
  fi
done
git worktree prune
echo "--- survivors ---"
git worktree list | grep ".loop-worktrees" || echo "(none)"
