# Loop LANDER - the maker never checks or lands its own work (owner rule 2026-09-20).
# The maker (GLM / MiniMax worker) commits a fix in a worktree, writes a hand-off
# file, and stops. This script - plain code, no AI - then:
#   1. brings the worktree up to date with origin/dev (collision = retry later, no strike)
#   2. runs typecheck ITSELF (never trusts the maker's claim)
#   3. asks a reviewer from a DIFFERENT PROVIDER (Codex gpt-5.6-sol; fallback grok via Cursor CLI)
#   4. APPROVE -> pushes the fix onto dev. Anything else -> records why and deletes the attempt.
# The pre-push hook refuses pushes from a loop worktree unless LOOP_LANDER=1, which only this script sets.
param([switch]$IgnorePause)   # supervised manual run while the loops are paused
$ErrorActionPreference = 'Continue'
$root = 'C:\Projects\capsule'
$handoffDir = Join-Path $root '.loop-worktrees\_handoff'
$log = Join-Path $root '.claude\loop-land.log'
function Say($m) { "[$(Get-Date -Format s)] $m" | Tee-Object -FilePath $log -Append }

function Record($h, $verdict, $reason) {
  $ledgerPath = Join-Path $root 'loop-ledger.json'
  $ledger = Get-Content $ledgerPath -Raw | ConvertFrom-Json
  $ledger.attempts += [pscustomobject]@{ item = $h.item; runId = $h.runId; verdict = $verdict; timestamp = (Get-Date).ToUniversalTime().ToString('o'); reason = $reason }
  $ledger | ConvertTo-Json -Depth 8 | Set-Content $ledgerPath -Encoding utf8NoBOM
  (@{ source = 'loop-land'; runId = $h.runId; item = $h.item; verdict = $verdict; reason = $reason; timestamp = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress) | Add-Content (Join-Path $root 'loop-run-log.md')
  Say "$($h.runId): $verdict - $reason"
}

function Discard($h, $file) {
  git -C $root worktree remove --force $h.worktree 2>$null
  git -C $root branch -D $h.branch 2>$null
  Remove-Item $file -Force
}

function Review($wt, $target) {
  $prompt = @"
You are the independent reviewer for an automated fix. In this directory run ``git diff origin/dev HEAD --stat`` and then ``git diff origin/dev HEAD`` (skip the bodies of .builder/, convex/_generated/, src/generated/ and schemas/ - only confirm those were regenerated, not hand-edited). Fix target: $target
Find reasons to REJECT: wrong scope, unrelated edits, secrets, hand-edited generated files, disabled tests, symptom-fixes, partial implementation. Also REJECT tedium: any new guard, policy, approval, or validation that blocks a reasonable user action without a proportionate real-world reason - this is a catering app, not a bank.
End your answer with exactly one line: VERDICT: APPROVE   or   VERDICT: REJECT - <main reason>
"@
  $out = Join-Path $wt '.loop-verdict.txt'
  Remove-Item $out -Force -ErrorAction SilentlyContinue
  codex exec -s read-only -m gpt-5.6-sol -C $wt -o $out $prompt *> $null
  $reviewer = 'gpt-5.6-sol'
  $text = if (Test-Path $out) { Get-Content $out -Raw } else { '' }
  if ($text -notmatch '(?m)^VERDICT: (APPROVE|REJECT)') {
    # Codex gave no verdict (quota / outage) - grok via Cursor CLI is also a different provider than the maker.
    $reviewer = 'cursor-grok-4.5-high-fast'
    $text = (& "$env:LOCALAPPDATA\cursor-agent\agent.ps1" -p --trust --model cursor-grok-4.5-high-fast --workspace $wt $prompt 2>$null) -join "`n"
  }
  Remove-Item $out -Force -ErrorAction SilentlyContinue
  $m = [regex]::Matches($text, '(?m)^VERDICT: (APPROVE|REJECT)(.*)$')
  if ($m.Count -eq 0) { return @{ reviewer = 'none'; verdict = 'NONE'; reason = 'no reviewer produced a verdict' } }
  $last = $m[$m.Count - 1]
  return @{ reviewer = $reviewer; verdict = $last.Groups[1].Value; reason = $last.Groups[2].Value.Trim(' -') }
}

if (-not (Test-Path $handoffDir)) { exit 0 }
if (-not $IgnorePause -and (Select-String -Path (Join-Path $root 'STATE.md') -Pattern 'loop-pause-all' -Quiet)) { Say 'paused - nothing landed'; exit 0 }

foreach ($file in Get-ChildItem $handoffDir -Filter *.json) {
  $h = Get-Content $file.FullName -Raw | ConvertFrom-Json
  $wt = $h.worktree
  if (-not (Test-Path $wt)) { Record $h 'FAIL' 'hand-off names a worktree that does not exist'; Remove-Item $file.FullName -Force; continue }
  if (git -C $wt status --porcelain) { Record $h 'FAIL' 'maker left uncommitted changes in the worktree'; Discard $h $file.FullName; continue }

  git -C $wt fetch origin dev --quiet
  if ((git -C $wt rev-list --count origin/dev..HEAD) -eq '0') { Record $h 'FAIL' 'no commits to land'; Discard $h $file.FullName; continue }
  if ((git -C $wt rev-list --count HEAD..origin/dev) -ne '0') {
    git -C $wt merge --no-edit origin/dev *> $null
    if ($LASTEXITCODE -ne 0) { git -C $wt merge --abort; Record $h 'COLLISION' 'newer dev work touches the same places - retry from a fresh worktree (not a strike)'; Discard $h $file.FullName; continue }
  }

  Push-Location $wt
  bun install --silent *> $null
  bun run typecheck *> (Join-Path $wt '.loop-typecheck.log')
  $typecheckOk = $LASTEXITCODE -eq 0
  Pop-Location
  if (-not $typecheckOk) { Record $h 'FAIL' "typecheck failed when the lander ran it: $((Get-Content (Join-Path $wt '.loop-typecheck.log') -Tail 3) -join ' | ')"; Discard $h $file.FullName; continue }
  Remove-Item (Join-Path $wt '.loop-typecheck.log') -Force

  $r = Review $wt "$($h.item) - $($h.target)"
  if ($r.verdict -ne 'APPROVE') { Record $h 'FAIL' "review by $($r.reviewer): $($r.verdict) $($r.reason)"; Discard $h $file.FullName; continue }

  git -C $wt commit --amend --no-edit --quiet --trailer "Reviewed-by: $($r.reviewer) APPROVE" --trailer 'Landed-by: loop-land.ps1'
  $env:LOOP_LANDER = '1'
  git -C $wt push --quiet origin HEAD:dev *>> $log
  $pushed = $LASTEXITCODE -eq 0
  $env:LOOP_LANDER = $null
  if (-not $pushed) { Record $h 'COLLISION' 'push to dev refused (dev moved again or the regen check blocked it) - see loop-land.log; retry from a fresh worktree'; Discard $h $file.FullName; continue }

  $sha = git -C $wt rev-parse --short HEAD
  Record $h 'LANDED' "on dev as $sha, reviewed by $($r.reviewer)"
  Discard $h $file.FullName
  git -C $root pull --ff-only --quiet origin dev *> $null   # best effort; never forced
}
