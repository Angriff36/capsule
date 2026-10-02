#!/bin/bash
# Delete files or folders the product builder made inside its own batch
# worktree. Every path must resolve (after .. and links) to something BELOW
# .loop-worktrees/<batch>/ - never the batch root, never its .git, never a
# control file (_handoff, _feedback, _patches, _control-blocker.json,
# _review-open), never a repair worktree. Any bad path refuses the whole call.
# Git Bash on Windows: compare one spelling (C:/x, lower case) on both sides.
norm() { cygpath -m "$(realpath -m -- "$1")" | tr '[:upper:]' '[:lower:]'; }
root=$(norm "$(dirname "$0")/../.loop-worktrees")
[ $# -gt 0 ] || { echo "usage: bash scripts/loop-rm.sh <path inside .loop-worktrees/<batch>/> ..." >&2; exit 2; }
targets=()
for p in "$@"; do
  case "$p" in -*) echo "REFUSED (no flags): $p" >&2; exit 1 ;; esac
  real=$(norm "$p") || { echo "REFUSED (cannot resolve): $p" >&2; exit 1; }
  rel=${real#"$root"/}
  if [ "$rel" = "$real" ]; then echo "REFUSED (not inside .loop-worktrees): $p" >&2; exit 1; fi
  batch=${rel%%/*}; inner=${rel#*/}
  case "$batch" in _*|repair-*) echo "REFUSED (control file or repair worktree): $p" >&2; exit 1 ;; esac
  if [ "$inner" = "$rel" ] || [ -z "$inner" ]; then echo "REFUSED (whole worktree): $p" >&2; exit 1; fi
  case "$inner" in .git|.git/*) echo "REFUSED (git data): $p" >&2; exit 1 ;; esac
  targets+=("$real")
done
rm -rf -- "${targets[@]}" && printf 'removed: %s\n' "${targets[@]}"
