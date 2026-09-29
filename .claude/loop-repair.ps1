# CONTROL-PLANE REPAIR runner (Ryan 2026-09-29) - plain code, no AI.
# The product maker never changes loop infrastructure. When a review reason or a failure
# is in .claude/**, .githooks/** or a loop script, the maker writes
# .loop-worktrees/_control-blocker.json once and stops handing off. loop-tick.cmd then
# calls this script instead of the maker:
#   - the blocker is recorded ONCE in loop-run-log.md;
#   - a separate repair session (loop-repair-settings.json, LOOP_REPAIR=1) fixes it in a
#     repair-* worktree and hands off; loop-land.ps1 reviews it with a different provider;
#     APPROVE lands it on dev and removes the blocker, and the product builder resumes;
#   - the repair session runs again ONLY when something new happened (blocker text changed,
#     a review verdict or feedback for this repair). No new input = no model wakes, no log.
$ErrorActionPreference = 'Continue'
$root = if ($env:LOOP_REPAIR_TEST_ROOT) { $env:LOOP_REPAIR_TEST_ROOT } else { 'C:\Projects\capsule' }   # test root: practice runs only
$bf = Join-Path $root '.loop-worktrees\_control-blocker.json'
$runLog = Join-Path $root 'loop-run-log.md'
if (-not (Test-Path $bf)) { exit 0 }

$raw = Get-Content $bf -Raw
$b = try { $raw | ConvertFrom-Json -ErrorAction Stop } catch { [pscustomobject]@{ reason = ($raw -replace '\s+', ' ').Trim() } }
function Set-Field($name, $value) { $b | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }
function Save { $b | ConvertTo-Json -Depth 6 | Set-Content $bf -Encoding utf8NoBOM }
function Note($verdict, $reason) {
  (@{ source = 'loop-repair'; runId = $b.repairRunId; verdict = $verdict; reason = $reason; timestamp = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress) | Add-Content $runLog
}

if (-not $b.repairRunId) { Set-Field 'repairRunId' ("repair-" + (Get-Date -Format 'yyyyMMddTHHmm')) }
$runId = $b.repairRunId
if (-not $b.recorded) { Set-Field 'recorded' $true; Save; Note 'CONTROL-BLOCKER' "$($b.reason) - repair process started" }
if ($b.status -eq 'needs-owner') {
  if (-not $b.ownerRecorded) { Set-Field 'ownerRecorded' $true; Save; Note 'NEEDS-OWNER' "$($b.reason) - Ryan must: $($b.owner_step)" }
  exit 0
}

# Only new input wakes the repair session.
$fb = Join-Path $root ".loop-worktrees\_feedback\$runId.md"
$fbStamp = if (Test-Path $fb) { (Get-Item $fb).LastWriteTimeUtc.Ticks } else { 0 }
$verdicts = @(Select-String -Path $runLog -Pattern $runId -SimpleMatch -ErrorAction SilentlyContinue | Where-Object { $_.Line -match '"source":"loop-land"' }).Count
$sig = "$($b.reason)|$($b.detail)|$($b.feedback)|$fbStamp|$verdicts"
if ($b.lastInput -eq $sig) { exit 0 }
Set-Field 'lastInput' $sig; Save

$handoff = Join-Path $root ".loop-worktrees\_handoff\$runId.json"
New-Item -ItemType Directory -Force (Join-Path $root '.loop-worktrees\_patches') | Out-Null
"[$(Get-Date -Format s)] control-plane repair $runId start: $($b.reason)" | Add-Content (Join-Path $root '.claude\loop-tick.log')
$env:LOOP_REPAIR = '1'
((Get-Content (Join-Path $root '.claude\loop-repair-prompt.txt') -Raw) + "`nYour run id: $runId`n") |
  claude -p --model claude-opus-5-5 --settings (Join-Path $root '.claude\loop-repair-settings.json') *>> (Join-Path $root '.claude\loop-tick.log')
$ok = $LASTEXITCODE -eq 0
$env:LOOP_REPAIR = $null

if (Test-Path $handoff) { & (Join-Path $root '.claude\loop-land.ps1') *>> (Join-Path $root '.claude\loop-tick.log'); exit 0 }
$b = Get-Content $bf -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $b) { exit 0 }
if ($b.status -eq 'needs-owner') { if (-not $b.ownerRecorded) { Set-Field 'ownerRecorded' $true; Save; Note 'NEEDS-OWNER' "$($b.reason) - Ryan must: $($b.owner_step)" }; exit 0 }
if (-not $ok) { Set-Field 'lastInput' ''; Save; exit 0 }   # the session itself failed: a real error, retried next run
Note 'REPAIR-IDLE' "repair session ended with no fix and no owner step - waits for new input: $($b.reason)"
exit 0
