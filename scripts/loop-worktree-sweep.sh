#!/bin/bash
# Sweep .loop-worktrees: a worktree is DISPOSABLE once its branch is safely
# on origin (the branch survives; the tree does not need to). Dead attempts
# (no unique commits) are removed outright. Only worktrees holding UNPUSHED
# commits are kept, and those are listed loudly so they cannot get lost.
# Run from the repo root. Deepest paths first (nested worktrees exist, sadly).
cd "$(git rev-parse --show-toplevel)" || exit 1
kept=0; removed=0
git worktree list --porcelain | awk '/^worktree /{print $2}' | grep "/.loop-worktrees/" | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2- | while read -r wt; do
  branch=$(git -C "$wt" branch --show-current 2>/dev/null)
  if [ -z "$branch" ]; then
    echo "REMOVE (detached/broken): $wt"
    git worktree remove --force "$wt" 2>/dev/null; continue
  fi
  ahead=$(git rev-list --count origin/main.."$branch" 2>/dev/null || echo "?")
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
