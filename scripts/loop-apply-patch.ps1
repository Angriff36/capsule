# Applies a patch inside ONE loop worktree. The maker cannot Edit .claude/** or
# .githooks/** (Claude Code treats them as sensitive even in a worktree), so it
# writes a patch and calls this. Ryan 2026-09-29: "these fucking blocks need to
# stop happening" - a review reason in a loop file must not stop the builder.
# The change still goes through the lander's review before it reaches dev.
param([Parameter(Mandatory)][string]$RunId, [Parameter(Mandatory)][string]$Patch)
$ErrorActionPreference = 'Stop'
if ($RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') { throw "bad run id: $RunId" }
$root = 'C:\Projects\capsule\.loop-worktrees'
$wt = Join-Path $root $RunId
if ((Split-Path ([IO.Path]::GetFullPath($wt)) -Parent) -ne $root) { throw "not a loop worktree: $wt" }
if (-not (Test-Path (Join-Path $wt '.git'))) { throw "no loop worktree: $wt" }
$p = (Resolve-Path $Patch).Path
if (-not $p.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "patch must be under $root" }
git -C $wt apply --whitespace=nowarn $p
if ($LASTEXITCODE -ne 0) { throw "git apply failed ($LASTEXITCODE)" }
git -C $wt status --short
