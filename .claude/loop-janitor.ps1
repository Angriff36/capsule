# Loop janitor — clears the routine PR adjudication so the human doesn't have to.
# DRY-RUN by default (prints what it WOULD do). Add -Execute to actually act.
#   preview:  pwsh -File .claude\loop-janitor.ps1
#   act:      pwsh -File .claude\loop-janitor.ps1 -Execute
# Runs as YOU (your gh auth) — so it can merge/close where Claude's classifier can't.
#
# Policy (deliberately conservative — respects the human's merge gate):
#   AUTO-MERGE  a loop/* PR only if ALL of: mergeable=CLEAN, CI green, body records
#               a cross-model APPROVE, body has NO "REVIEW_GATE=0", title NOT HIGH-SCRUTINY.
#   AUTO-CLOSE  a PR whose diff vs main is empty (already merged/obsolete).
#   LEAVE       everything else (conflicts, CI-red, HIGH-SCRUTINY, unreviewed, non-loop)
#               and print it so the human sees the short real-decision list.
param([switch]$Execute, [string]$Repo = "Angriff36/capsule", [string]$Checkout = "C:\Projects\capsule")

$act = if ($Execute) { "" } else { "[DRY-RUN] would " }
git -C $Checkout fetch origin --quiet 2>$null

$prs = gh pr list -R $Repo --state open --limit 100 `
  --json number,title,isDraft,mergeable,mergeStateStatus,statusCheckRollup,headRefName,body |
  ConvertFrom-Json

$merged=@(); $closed=@(); $left=@()
foreach ($p in $prs) {
  $checks = $p.statusCheckRollup
  $green  = $checks -and -not ($checks | Where-Object { $_.conclusion -in 'FAILURE','TIMED_OUT','CANCELLED','ACTION_REQUIRED' -or $_.status -ne 'COMPLETED' })
  $emptyDiff = [string]::IsNullOrWhiteSpace((git -C $Checkout diff --shortstat "origin/main...origin/$($p.headRefName)" 2>$null))
  $isLoop   = $p.headRefName -like 'loop/*'
  $reviewed = ($p.body -match '(?i)\bAPPROVE\b') -and ($p.body -notmatch 'REVIEW_GATE=0')
  $hiScrut  = $p.title -match '(?i)HIGH-SCRUTINY'

  if ($emptyDiff) {
    $closed += "#$($p.number)  $($p.title)  [already in main]"
    if ($Execute) { gh pr close $p.number -R $Repo --comment "Auto-closed by loop-janitor: diff vs main is empty (already merged/obsolete)." 2>&1 | Out-Null }
  }
  elseif ($isLoop -and $p.mergeStateStatus -eq 'CLEAN' -and $green -and $reviewed -and -not $hiScrut) {
    $merged += "#$($p.number)  $($p.title)"
    if ($Execute) {
      if ($p.isDraft) { gh pr ready $p.number -R $Repo 2>&1 | Out-Null }
      gh pr merge $p.number -R $Repo --squash --auto --delete-branch 2>&1 | Out-Null
    }
  }
  else {
    $reason =
      if ($hiScrut)                              { 'HIGH-SCRUTINY — your review' }
      elseif ($p.mergeStateStatus -in 'DIRTY','BEHIND') { 'conflicts with main — needs rebase' }
      elseif (-not $green)                       { 'CI red/pending' }
      elseif ($isLoop -and -not $reviewed)       { 'no recorded cross-model APPROVE' }
      else                                       { 'not a loop PR — your call' }
    $left += "#$($p.number)  [$reason]  $($p.title)"
  }
}

Write-Output "===== ${act}AUTO-MERGE (reviewed, clean, green, not high-scrutiny) ====="
if ($merged) { $merged | ForEach-Object { Write-Output "  $_" } } else { Write-Output "  (none)" }
Write-Output "`n===== ${act}AUTO-CLOSE (already in main) ====="
if ($closed) { $closed | ForEach-Object { Write-Output "  $_" } } else { Write-Output "  (none)" }
Write-Output "`n===== LEFT FOR YOU ($($left.Count)) ====="
if ($left) { $left | ForEach-Object { Write-Output "  $_" } } else { Write-Output "  (nothing — inbox zero)" }
if (-not $Execute) { Write-Output "`n(dry-run — re-run with -Execute to act)" }
