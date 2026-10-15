# Daily review gate (Ryan 2026-09-28: "the reviewer should only check work once a day
# then have its back and forth on all the changes with no delay until it passes").
# Opens the review (creates .loop-worktrees\_review-open) when the last landed batch is
# 24 hours old or more and dev holds work that is not in production (main) yet.
$root = 'C:\Projects\capsule'
$open = Join-Path $root '.loop-worktrees\_review-open'
$last = Join-Path $root '.loop-worktrees\_last-review'
if (Test-Path $open) {
  # The batch can reach production without this review's APPROVE (a release by hand, or a
  # release that went live after the lander gave up). Then dev == main and there is nothing
  # left to review: close the review so the maker goes back to building.
  git -C $root fetch origin dev main --quiet
  if ($LASTEXITCODE -ne 0 -or (git -C $root rev-list --count 'origin/main..origin/dev') -ne '0') { exit 0 }
  Remove-Item $open -Force
  "[$(Get-Date -Format s)] daily review closed: dev is already in production (nothing to review)"
  exit 0
}
if ((Test-Path $last) -and ((Get-Date) - (Get-Item $last).LastWriteTime).TotalHours -lt 24) { exit 0 }
git -C $root fetch origin dev main --quiet
if ((git -C $root rev-list --count 'origin/main..origin/dev') -eq '0') { exit 0 }
$branch = 'dev (not yet in production)'
New-Item -ItemType File -Force $open | Out-Null
# loop-tick.cmd already sends this script's output to loop-tick.log and holds it open,
# so Add-Content to the log fails; write to output instead.
"[$(Get-Date -Format s)] daily review opened for $branch"
