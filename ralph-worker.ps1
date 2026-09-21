# Ralph WORKER. The orchestrator (RALPH_CLI in .ralph.env - gpt-6-astra via Codex) thinks,
# picks the task, reviews, tests, commits, and pushes. It does NOT write the code: it writes
# one narrow task into a file and runs this script. The worker is glm-5.3-flash on z.ai
# ("haiku" is the alias that reaches it under claude-glm.ps1) - fast, cheap, no memory of the
# orchestrator's conversation. The worker's last message goes to stdout.
#   pwsh -NoProfile -File ./ralph-worker.ps1 -TaskFile .ralph-tasks/003-add-field.md
# Locks: .claude/ralph-worker-settings.json (may edit code and run bun; may not commit, push,
# switch branches, deploy, or touch hooks / loop files).
param([Parameter(Mandatory)][string]$TaskFile)
Set-Location $PSScriptRoot
if (-not (Test-Path $TaskFile)) { Write-Error "task file not found: $TaskFile"; exit 2 }
$start = Get-Date
# A child pwsh, not `& script.ps1`: only a real process hands the piped task to claude's stdin.
Get-Content $TaskFile -Raw | pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\claude-glm.ps1" -p --model haiku --settings .claude\ralph-worker-settings.json
$code = $LASTEXITCODE
"$(Get-Date -Format s) task=$TaskFile exit=$code seconds=$([int]((Get-Date) - $start).TotalSeconds)" | Add-Content .ralph-workers.log
exit $code
