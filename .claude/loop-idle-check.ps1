# Skip an empty builder round (watch, 2026-10-12: on 10-11 the maker woke every
# 5 minutes, about 140 times, only to write _nothing-left again - each wake is a
# paid Opus session). Same idea as the control-blocker rule (Ryan 2026-09-29):
# no new input = no model wakes.
#   -Save : after a round that wrote _nothing-left, store what the maker saw.
#   (none): exit 1 = nothing changed since that round, skip the model;
#           exit 0 = something changed (or no _nothing-left), run the round.
# Inputs: open issues and their last change, dev/main heads, the plan, STATE.md,
# the maker prompt and constraints, site comments, review/release flags.
param([switch]$Save)
$root = 'C:\Projects\capsule'
$flag = Join-Path $root '.loop-worktrees\_nothing-left'
$stamp = Join-Path $root '.loop-worktrees\_nothing-left.inputs'
function Fingerprint {
  $parts = @()
  $parts += (gh issue list --repo Angriff36/capsule --state open --limit 200 --json number,updatedAt --jq '.[] | "\(.number) \(.updatedAt)"' 2>$null) -join ','
  if ($LASTEXITCODE -ne 0) { return $null }
  $parts += (git -C $root ls-remote origin refs/heads/dev refs/heads/main 2>$null) -join ','
  foreach ($f in 'IMPLEMENTATION_PLAN.md', 'STATE.md', '.claude\loop-tick-prompt.txt', 'loop-constraints.md', '.loop-worktrees\_site-comments.md') {
    $p = Join-Path $root $f
    $parts += if (Test-Path $p) { (Get-FileHash $p).Hash } else { 'none' }
  }
  foreach ($f in '_review-open', '_release-pending', '_control-blocker.json') {
    $parts += Test-Path (Join-Path $root ".loop-worktrees\$f")
  }
  return ($parts -join '|')
}
if ($Save) {
  if (Test-Path $flag) { $fp = Fingerprint; if ($fp) { Set-Content $stamp $fp } }
  exit 0
}
if (-not (Test-Path $flag) -or -not (Test-Path $stamp)) { exit 0 }
$fp = Fingerprint
if ($fp -and $fp -eq (Get-Content $stamp -Raw).Trim()) { exit 1 }
Remove-Item $stamp -ErrorAction SilentlyContinue
exit 0
