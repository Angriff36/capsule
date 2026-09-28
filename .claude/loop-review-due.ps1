# Daily review gate (Ryan 2026-09-28: "the reviewer should only check work once a day
# then have its back and forth on all the changes with no delay until it passes").
# Opens the review (creates .loop-worktrees\_review-open) when the last landed batch is
# 24 hours old or more and the batch branch holds work that is not on dev yet.
$root = 'C:\Projects\capsule'
$open = Join-Path $root '.loop-worktrees\_review-open'
$last = Join-Path $root '.loop-worktrees\_last-review'
if (Test-Path $open) { exit 0 }
if ((Test-Path $last) -and ((Get-Date) - (Get-Item $last).LastWriteTime).TotalHours -lt 24) { exit 0 }
$branch = git -C $root for-each-ref --sort=-committerdate --format='%(refname:short)' 'refs/heads/loop/batch-*' 'refs/heads/loop/build-*' | Select-Object -First 1
if (-not $branch) { exit 0 }
git -C $root fetch origin dev --quiet
if ((git -C $root rev-list --count "origin/dev..$branch") -eq '0') { exit 0 }
New-Item -ItemType File -Force $open | Out-Null
"[$(Get-Date -Format s)] daily review opened for $branch" | Add-Content (Join-Path $root '.claude\loop-tick.log')
