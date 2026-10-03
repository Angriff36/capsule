# Loop PUBLISHER - puts the builder's committed work on dev after every round, before any
# review (Ryan 2026-09-28: "why doesnt it go to dev? i need to be able to test the changes
# myself too. once the reviewer clears it it should go to production").
# Plain code, no AI. Typecheck must pass so a broken round never reaches Ryan's test copy.
# The daily review (loop-land.ps1) then checks everything on dev that is not in production
# yet, and on APPROVE releases it to production.
$ErrorActionPreference = 'Continue'
$root = 'C:\Projects\capsule'
$log = Join-Path $root '.claude\loop-land.log'
function Say($m) { "[$(Get-Date -Format s)] publish: $m" | Tee-Object -FilePath $log -Append }

$wt = Get-ChildItem (Join-Path $root '.loop-worktrees') -Directory -Filter 'batch-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $wt) { exit 0 }
$wt = $wt.FullName
if ((git -C $wt rev-parse --abbrev-ref HEAD 2>$null) -notlike 'loop/batch-*') { Say "$wt is not on a loop/batch-* branch - skipped"; exit 0 }
# Proof files the pre-push check refreshed on an earlier refused push: commit them.
$left = @(git -C $wt status --porcelain | ForEach-Object { $_.Substring(3) })
if ($left.Count -gt 0 -and -not ($left | Where-Object { $_ -notlike 'generated/proof/*' })) {
  git -C $wt add -- generated/proof
  git -C $wt commit --quiet -m '[loop] Refresh the proof catalog so the round can go to dev'
}
if (git -C $wt status --porcelain) { Say "uncommitted changes in $wt - skipped until the builder commits them"; exit 0 }

git -C $wt fetch origin dev --quiet
if ((git -C $wt rev-list --count origin/dev..HEAD) -eq '0') { exit 0 }
if ((git -C $wt rev-list --count HEAD..origin/dev) -ne '0') {
  git -C $wt merge --no-edit origin/dev *> $null
  if ($LASTEXITCODE -ne 0) { git -C $wt merge --abort; Say "newer dev work collides - the builder merges origin/dev in $wt next round"; exit 0 }
}

Push-Location $wt
bun install --silent *> $null
bun run typecheck *> (Join-Path $wt '.loop-typecheck.log')
$ok = $LASTEXITCODE -eq 0
Pop-Location
if (-not $ok) { Say "typecheck failed - not published: $((Get-Content (Join-Path $wt '.loop-typecheck.log') -Tail 3) -join ' | ')"; Remove-Item (Join-Path $wt '.loop-typecheck.log') -Force; exit 0 }
Remove-Item (Join-Path $wt '.loop-typecheck.log') -Force

$env:LOOP_LANDER = '1'
git -C $wt push --quiet origin HEAD:dev *>> $log
$pushed = $LASTEXITCODE -eq 0
# The pre-push check refreshes stale proof files itself and asks for them to be committed;
# do that once and push again, so one forgotten refresh does not hold the round off dev.
$dirty = @(git -C $wt status --porcelain | ForEach-Object { $_.Substring(3) })
if (-not $pushed -and $dirty.Count -gt 0 -and -not ($dirty | Where-Object { $_ -notlike 'generated/proof/*' })) {
  git -C $wt add -- generated/proof
  git -C $wt commit --quiet -m '[loop] Refresh the proof catalog so the round can go to dev'
  git -C $wt push --quiet origin HEAD:dev *>> $log
  $pushed = $LASTEXITCODE -eq 0
}
$env:LOOP_LANDER = $null
if (-not $pushed) { Say "push to dev refused (see above) - retried next round"; exit 0 }
Say "on dev as $(git -C $wt rev-parse --short HEAD)"
# Ryan tests on the main checkout: bring it up to date (never forced; a clash is only logged).
# convex dev rewrites convex/_generated on its own; that local copy would block every pull,
# and convex dev writes it again after the pull.
git -C $root checkout -- convex/_generated *>> $log
git -C $root pull --no-rebase --quiet origin dev *>> $log
if ($LASTEXITCODE -ne 0) {
  # A pull that stops on a clash leaves a half-done merge (conflict marks in
  # source files) under Ryan and every other session. Undo it, so the
  # checkout is exactly as it was (2026-09-30: one such merge broke a test run).
  if (Test-Path (Join-Path $root '.git\MERGE_HEAD')) { git -C $root merge --abort *>> $log }
  Say 'main checkout pull refused - it keeps its local files; pull by hand'
}
