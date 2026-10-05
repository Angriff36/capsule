# CONTROL-PLANE REPAIR only: applies a patch inside ONE repair worktree
# (.loop-worktrees\repair-*). Claude Code refuses Edit on .claude/** and .githooks/**
# even in a worktree, so the repair session writes a patch and calls this.
# The product maker never gets this: its settings deny it, it has no LOOP_REPAIR
# variable, and its worktrees are batch-*. The lander reviews every repair with a
# reviewer from a different provider before it reaches dev.
param([Parameter(Mandatory)][string]$RunId, [Parameter(Mandatory)][string]$Patch)
$ErrorActionPreference = 'Stop'
if ($env:LOOP_REPAIR -ne '1') { throw 'only the control-plane repair process may run this' }
if ($RunId -notmatch '^repair-[A-Za-z0-9_-]+$') { throw "not a repair run id: $RunId" }
$root = 'C:\Projects\capsule\.loop-worktrees'
$wt = Join-Path $root $RunId
if ((Split-Path ([IO.Path]::GetFullPath($wt)) -Parent) -ne $root) { throw "not a loop worktree: $wt" }
if (-not (Test-Path (Join-Path $wt '.git'))) { throw "no repair worktree: $wt" }
if ((git -C $wt rev-parse --abbrev-ref HEAD) -ne "loop/$RunId") { throw "worktree is not on loop/$RunId" }
$p = (Resolve-Path $Patch).Path
if (-not $p.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "patch must be under $root" }
git -C $wt apply --whitespace=nowarn $p
if ($LASTEXITCODE -ne 0) { throw "git apply failed ($LASTEXITCODE)" }
git -C $wt status --short
