# Loop LANDER - the maker never checks or lands its own work (owner rule 2026-09-20).
# The maker (GLM / MiniMax worker) commits a fix in a worktree, writes a hand-off
# file, and stops. This script - plain code, no AI - then:
#   1. brings the worktree up to date with origin/dev (collision = retry later, no strike)
#   2. runs typecheck ITSELF (never trusts the maker's claim)
#   3. asks a reviewer from a DIFFERENT PROVIDER (Codex gpt-5.6-sol; fallback grok via Cursor CLI)
#   4. APPROVE -> pushes the fix onto dev, then releases dev to production with
#      scripts/release-clean.sh (Ryan 2026-09-28: "once the reviewer clears it it should go to
#      production"). Every round is already on dev (loop-publish.ps1). Anything else -> records why and KEEPS the worktree, so the
#      maker answers the findings in the same campaign (Ryan 2026-09-27: "If rejected, fix every review
#      finding in the same campaign and resubmit"). Only landed or empty attempts are deleted.
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

function Keep($file) {
  # Unlanded work is never thrown away: the worktree and branch stay, only the hand-off goes.
  # The maker's next run finds the worktree in its STATE.md checklist and continues there.
  Remove-Item $file -Force
}

function Discard($h, $file) {
  # The hand-off is model-written: destroy only the worktree and branch that
  # belong to this run, never whatever path or branch name the file says.
  $expectedWt = Join-Path $root ".loop-worktrees\$($h.runId)"
  $expectedBranch = "loop/$($h.runId)"
  $actualWt = try { (Resolve-Path $h.worktree -ErrorAction Stop).Path } catch { '' }
  $checkedOut = if ($actualWt) { (git -C $actualWt rev-parse --abbrev-ref HEAD 2>$null) } else { '' }
  if ($actualWt -and $actualWt -ieq $expectedWt -and $h.branch -eq $expectedBranch -and $checkedOut -eq $expectedBranch) {
    git -C $root worktree remove --force $actualWt 2>$null
    git -C $root branch -D $expectedBranch 2>$null
  } else {
    Say "$($h.runId): refusing to discard '$($h.worktree)' / '$($h.branch)' - expected $expectedWt on $expectedBranch (left in place)"
  }
  Remove-Item $file -Force
}

function Release($h, $reviewer) {
  # Approved -> production, from a private clean copy so the running loop cannot disturb it.
  # A failed release leaves _release-pending; a landed control-plane repair retries it.
  $pending = Join-Path $root '.loop-worktrees\_release-pending'
  $rel = (& 'C:\Program Files\Git\bin\bash.exe' -lc "cd /c/Projects/capsule && bash scripts/release-clean.sh --reviewer $reviewer" 2>&1) -join "`n"
  $rel | Add-Content $log
  $result = ([regex]::Matches($rel, '(?m)^RESULT: .*$') | Select-Object -Last 1).Value
  if ($result -like 'RESULT: PASS*') { Remove-Item $pending -Force -ErrorAction SilentlyContinue; Record $h 'RELEASED' "production: $result" }
  else { Set-Content $pending $reviewer; Record $h 'RELEASE-FAIL' "production release did not pass: $(if ($result) { $result } else { ($rel -split "`n" | Select-Object -Last 3) -join ' | ' }) - see loop-land.log" }
}

function Review($wt, $target, $base = 'origin/main', $extra = '') {
  $prompt = @"
You are the independent reviewer for an automated fix. In this directory run ``git diff $base HEAD --stat`` and then ``git diff $base HEAD`` (everything this change adds) (skip the bodies of .builder/, convex/_generated/, src/generated/ and schemas/ - only confirm those were regenerated, not hand-edited). Fix target: $target
Find reasons to REJECT: wrong scope, unrelated edits, secrets, hand-edited generated files, disabled tests, symptom-fixes, partial implementation of what the target says this change delivers. The change may be one checkpoint of a larger capability: work the target names as still open is not a reason to reject; anything the target claims as done must be complete and proven. Also REJECT tedium: any new guard, policy, approval, or validation that blocks a reasonable user action without a proportionate real-world reason - this is a catering app, not a bank.
$extra
If the diff touches authored UI (src/app, src/features, src/ui, src/styles): DESIGN.md in this directory is the presentation authority for this repo. Read it, then compare these changes against it directly. (1) List every DESIGN.md rule the diff violates - quote the rule and point at the line that breaks it; check the front-matter colors, type faces, and radii against src/styles/app.css, and the Components, Do's and Don'ts, Responsive, and Accessibility sections against the markup. (2) Distinguish a usability improvement made WITHIN the established visual language from a REPLACEMENT of the visual language. (3) REJECT any replacement of the visual language that changes implementation only; a visual-language change is acceptable ONLY if this same diff also amends DESIGN.md to match and cites the owner's explicit approval. (4) Adding a token to design-contract-exceptions.json to make new work pass is a REJECT.
On REJECT give numbered reasons with file and line, and say concretely what a passing fix must do - the maker's next attempt is built from your text.
End your answer with exactly one line: VERDICT: APPROVE   or   VERDICT: REJECT - <main reason>
"@
  $out = Join-Path $wt '.loop-verdict.txt'
  Remove-Item $out -Force -ErrorAction SilentlyContinue
  # Ryan 2026-09-22: "I don't think it needs highest reasoning" - xhigh made each round take 20-40 minutes.
  codex exec -s read-only -m gpt-5.6-sol -c model_reasoning_effort="high" -C $wt -o $out $prompt *> $null
  $reviewer = 'gpt-5.6-sol'
  $text = if (Test-Path $out) { Get-Content $out -Raw } else { '' }
  if ($text -notmatch '(?m)^VERDICT: (APPROVE|REJECT)') {
    # Codex gave no verdict (quota / outage) - grok via Cursor CLI is also a different provider than the maker.
    $reviewer = 'cursor-grok-4.5-high-fast'
    $text = (& "$env:LOCALAPPDATA\cursor-agent\agent.ps1" -p --trust --model cursor-grok-4.5-high-fast --workspace $wt $prompt 2>$null) -join "`n"
  }
  Remove-Item $out -Force -ErrorAction SilentlyContinue
  $m = [regex]::Matches($text, '(?m)^VERDICT: (APPROVE|REJECT)(.*)$')
  if ($m.Count -eq 0) { return @{ reviewer = 'none'; verdict = 'NONE'; reason = 'no reviewer produced a verdict'; full = $text } }
  $last = $m[$m.Count - 1]
  return @{ reviewer = $reviewer; verdict = $last.Groups[1].Value; reason = $last.Groups[2].Value.Trim(' -'); full = $text }
}

if (-not (Test-Path $handoffDir)) { exit 0 }
if (-not $IgnorePause -and (Select-String -Path (Join-Path $root 'STATE.md') -Pattern 'loop-pause-all' -Quiet)) { Say 'paused - nothing landed'; exit 0 }

foreach ($file in Get-ChildItem $handoffDir -Filter *.json) {
  $h = Get-Content $file.FullName -Raw | ConvertFrom-Json
  $wt = $h.worktree
  if (-not (Test-Path $wt)) { Record $h 'FAIL' 'hand-off names a worktree that does not exist'; Remove-Item $file.FullName -Force; continue }
  # The hand-off is model-written: before ANY git operation in it, the path
  # must be this run's own worktree, checked out on this run's own branch.
  $expectedWt = Join-Path $root ".loop-worktrees\$($h.runId)"
  $expectedBranch = "loop/$($h.runId)"
  $actualWt = try { (Resolve-Path $wt -ErrorAction Stop).Path } catch { '' }
  $checkedOut = if ($actualWt) { (git -C $actualWt rev-parse --abbrev-ref HEAD 2>$null) } else { '' }
  if (-not ($actualWt -and $actualWt -ieq $expectedWt -and $h.branch -eq $expectedBranch -and $checkedOut -eq $expectedBranch)) {
    Record $h 'FAIL' "hand-off names '$wt' on '$($h.branch)' (checked out: '$checkedOut'); this run owns $expectedWt on $expectedBranch - nothing touched"
    Remove-Item $file.FullName -Force; continue
  }
  if (git -C $wt status --porcelain) { Record $h 'FAIL' "maker left uncommitted changes in the worktree - worktree kept: $wt"; Keep $file.FullName; continue }

  git -C $wt fetch origin dev main --quiet
  # CONTROL-PLANE REPAIR hand-offs (repair-*) change only the loop itself: reviewed against dev,
  # landed on dev, never released, and landing removes the blocker so the builder resumes.
  $isRepair = $h.runId -like 'repair-*'
  $base = if ($isRepair) { 'origin/dev' } else { 'origin/main' }
  if ((git -C $wt rev-list --count "$base..HEAD") -eq '0') { Record $h 'FAIL' "nothing new since $base"; Discard $h $file.FullName; continue }
  if ((git -C $wt rev-list --count HEAD..origin/dev) -ne '0') {
    git -C $wt merge --no-edit origin/dev *> $null
    if ($LASTEXITCODE -ne 0) { git -C $wt merge --abort; Record $h 'COLLISION' "newer dev work touches the same places - merge origin/dev in the kept worktree and resolve (not a strike): $wt"; Keep $file.FullName; continue }
  }

  Push-Location $wt
  bun install --silent *> $null
  bun run typecheck *> (Join-Path $wt '.loop-typecheck.log')
  $typecheckOk = $LASTEXITCODE -eq 0
  Pop-Location
  if (-not $typecheckOk) { Record $h 'FAIL' "typecheck failed when the lander ran it: $((Get-Content (Join-Path $wt '.loop-typecheck.log') -Tail 3) -join ' | ') - worktree kept: $wt"; Remove-Item (Join-Path $wt '.loop-typecheck.log') -Force; Keep $file.FullName; continue }
  Remove-Item (Join-Path $wt '.loop-typecheck.log') -Force

  $extra = if ($isRepair) { 'This is a CONTROL-PLANE REPAIR of the loop itself. REJECT any change to Capsule product code, and any change that weakens the product maker deny list, the independent reviewer, the pre-push guard, or the rule that the maker never checks or lands its own work.' } else { '' }
  $r = Review $wt "$($h.item) - $($h.target)" $base $extra
  if ($r.verdict -eq 'NONE') {
    # No reviewer could answer (OpenAI plan empty, Cursor not logged in, outage). That is
    # not a verdict on the fix: keep the worktree and the hand-off, no strike, and the next
    # run tries the review again (loop-tick.cmd runs the lander first when a hand-off waits).
    Record $h 'NOREVIEW' "no reviewer produced a verdict (Codex: plan/outage; Cursor grok: $((($r.full -split "`n") | Select-String -Pattern 'Error|ERROR' | Select-Object -First 1) -replace '^\s+','')) - fix kept, review retried next run"
    continue
  }
  if ($r.verdict -ne 'APPROVE') {
    # Keep the WHOLE review and the rejected patch; the worktree is kept too, and the next maker run answers this file in it.
    $fbDir = Join-Path $root '.loop-worktrees\_feedback'
    New-Item -ItemType Directory -Force $fbDir | Out-Null
    $fb = Join-Path $fbDir "$($h.runId).md"
    $patch = (git -C $wt diff origin/main HEAD -- . ':(exclude).builder' ':(exclude)convex/_generated' ':(exclude)src/generated' ':(exclude)schemas') -join "`n"
    "# Rejected attempt $($h.runId)`n`nItem: $($h.item)`n`nTarget: $($h.target)`n`nReviewer: $($r.reviewer) - $($r.verdict)`n`n## Full review`n`n$($r.full)`n`n## The rejected patch (generated trees left out)`n`n``````diff`n$patch`n``````" | Set-Content $fb -Encoding utf8NoBOM
    Record $h 'FAIL' "review by $($r.reviewer): $($r.verdict) $($r.reason) | full review + rejected patch: .loop-worktrees/_feedback/$($h.runId).md | worktree kept: $wt"
    Keep $file.FullName; continue
  }

  # A new empty commit, never --amend: every build round is already on dev (loop-publish.ps1),
  # so amending the tip rewrote a pushed commit and every approval ended in COLLISION.
  git -C $wt commit --allow-empty --quiet -m "[loop] Reviewed: $($h.runId)" --trailer "Reviewed-by: $($r.reviewer) APPROVE" --trailer 'Landed-by: loop-land.ps1'
  $env:LOOP_LANDER = '1'
  $pushOut = (git -C $wt push --quiet origin HEAD:dev 2>&1) -join "`n"
  $pushed = $LASTEXITCODE -eq 0
  $pushOut | Add-Content $log
  $env:LOOP_LANDER = $null
  if (-not $pushed -and $pushOut -match 'non-fast-forward|fetch first') {
    # Dev moved while the reviewer worked. Drop the review commit and KEEP the hand-off:
    # the next run merges the new dev and reviews again, with no maker round in between.
    git -C $wt reset --quiet --hard HEAD~1
    Record $h 'COLLISION' "approved, but dev moved during the review - merging the new dev and reviewing again next run: $wt"
    continue
  }
  if (-not $pushed) { Record $h 'COLLISION' "push to dev refused (dev moved again or the regen check blocked it) - see loop-land.log; worktree kept, merge origin/dev and hand off again: $wt"; Keep $file.FullName; continue }

  $sha = git -C $wt rev-parse --short HEAD
  Record $h 'LANDED' "on dev as $sha, reviewed by $($r.reviewer)"
  if ($isRepair) {
    Remove-Item (Join-Path $root '.loop-worktrees\_control-blocker.json') -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $root ".loop-worktrees\_patches\$($h.runId).patch") -Force -ErrorAction SilentlyContinue
    Discard $h $file.FullName
    git -C $root pull --no-rebase --quiet origin dev *> $null   # the live loop files take the repair
    $pending = Join-Path $root '.loop-worktrees\_release-pending'
    if (Test-Path $pending) { Release $h ((Get-Content $pending -Raw).Trim()) }   # the approved batch that could not go live
    continue
  }
  # The day's batch passed: close the review; the next one opens 24 hours from now.
  Remove-Item (Join-Path $root '.loop-worktrees\_review-open') -Force -ErrorAction SilentlyContinue
  Set-Content (Join-Path $root '.loop-worktrees\_last-review') (Get-Date -Format s)
  Discard $h $file.FullName
  git -C $root pull --no-rebase --quiet origin dev *> $null   # best effort; never forced
  Release $h $r.reviewer
}
