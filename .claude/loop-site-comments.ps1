# Ryan's comments on the live site, handled as time passes (Ryan, 2026-10-01:
# "just make it so comments are automatically addressed as time passes").
#
# Ryan leaves comments with the Vercel toolbar on the live site. This plain
# script, run at the start of every builder round (at most every 10 minutes):
# 1. copies each open comment into a GitHub issue labelled `site-comment`
#    (once; the issue names the page, the selected text and the screen part),
#    and replies on the comment with the issue link, so Ryan sees it was taken;
# 2. writes the open ones, oldest first, to .loop-worktrees/_site-comments.md,
#    which the builder works before its next plan capability, committing with
#    "Fixes #N";
# 3. when such an issue is closed - GitHub closes it when the "Fixes #N" commit
#    reaches main, which is the production release - replies "Done, now live"
#    on the comment and marks it resolved.
# A failure here is logged and never stops a builder round.
$ErrorActionPreference = 'Stop'
$root = 'C:\Projects\capsule'
$log = Join-Path $root '.claude\loop-tick.log'
$stamp = Join-Path $root '.loop-worktrees\_site-comments.stamp'
$queue = Join-Path $root '.loop-worktrees\_site-comments.md'
$repo = 'Angriff36/capsule'
$team = 'team_YxFzuz829x7VAb5w5Yx2lycJ'
$project = 'prj_vA7SAjDhyGT3Yb6RZYkTB2FRT6eq'
function Say($text) { try { Add-Content $log "[$(Get-Date -Format s)] site-comments: $text" } catch { } }

try {
  if ((Test-Path $stamp) -and ((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalMinutes -lt 10) { exit 0 }
  Set-Content $stamp (Get-Date -Format s)

  # The saved Vercel login expires after some hours; the Vercel command line
  # refreshes it whenever it runs (2026-10-01: the job got 401 from 14:49 on).
  & vercel whoami *> $null
  $auth = Join-Path $env:APPDATA 'com.vercel.cli\Data\auth.json'
  $token = (Get-Content $auth -Raw | ConvertFrom-Json).token
  if (-not $token) { Say 'no Vercel login on this computer (vercel login) - skipped'; exit 0 }
  $headers = @{ Authorization = "Bearer $token" }
  $api = 'https://api.vercel.com/v1/toolbar/threads'

  function Threads($status) {
    $all = @(); $offset = 0
    while ($true) {
      $page = Invoke-RestMethod -Headers $headers -Uri "$api`?teamId=$team&projectId=$project&status=$status&limit=50&offset=$offset"
      $all += @($page.threads)
      if (@($page.threads).Count -lt 50) { break }
      $offset += 50
    }
    return $all
  }
  function Reply($threadId, $markdown) {
    Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' `
      -Uri "$api/$threadId/messages?teamId=$team" -Body (@{ markdown = $markdown } | ConvertTo-Json) | Out-Null
  }
  function Resolve($threadId) {
    Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json' `
      -Uri "$api/$threadId`?teamId=$team" -Body (@{ resolved = $true } | ConvertTo-Json) | Out-Null
  }

  gh label create site-comment --repo $repo --color 'C2410C' --description "Ryan's comment on the live site; the builder works these first" 2>$null | Out-Null
  $issues = @(gh issue list --repo $repo --label site-comment --state all --limit 500 --json 'number,state,body,url' | ConvertFrom-Json)
  $byThread = @{}
  foreach ($issue in $issues) {
    if ($issue.body -match 'vercel-thread:([A-Za-z0-9_-]+)') { $byThread[$Matches[1]] = $issue }
  }

  $open = @(Threads 'unresolved' | Sort-Object { $_.messages[0].timestamp })
  $made = 0; $done = 0
  foreach ($thread in $open) {
    $issue = $byThread[$thread.id]
    if (-not $issue) {
      $first = $thread.messages[0]
      $text = ($thread.messages | ForEach-Object { $_.text.Trim() }) -join "`n`n"
      $title = $first.text.Trim() -replace '\s+', ' '
      if ($title.Length -gt 80) { $title = $title.Substring(0, 77) + '...' }
      $context = $thread.context
      $body = @(
        "<!-- vercel-thread:$($thread.id) -->",
        "Ryan's comment on the live site ($(([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$first.timestamp)).LocalDateTime.ToString('yyyy-MM-dd HH:mm'))):",
        '',
        ($text -split "`n" | ForEach-Object { "> $_" }) -join "`n",
        '',
        "- Page: $($context.href)",
        "- Text he selected: $($context.selection)",
        "- Comment on Vercel: $($thread.webUrl)",
        '',
        'Screen part he pointed at:',
        '```',
        $context.frameworkContext,
        '```',
        '',
        'Builder: do what the comment asks (a question means the screen should answer it). Commit with "Fixes #<this issue>". The issue closes when the fix reaches production; the comment is then marked done.'
      ) -join "`n"
      $url = gh issue create --repo $repo --label site-comment --title "Site comment: $title" --body $body
      $number = ($url -split '/')[-1]
      $issue = [pscustomobject]@{ number = [int]$number; state = 'OPEN'; url = $url }
      $byThread[$thread.id] = $issue
      try { Reply $thread.id "Picked up for the builder: $url" } catch { Say "reply on $($thread.id) failed: $($_.Exception.Message)" }
      $made++
    }
    elseif ($issue.state -eq 'CLOSED') {
      try {
        Reply $thread.id "Done, now live: $($issue.url)"
        Resolve $thread.id
        $done++
      } catch { Say "resolving $($thread.id) failed: $($_.Exception.Message)" }
    }
  }

  # The builder's queue: open comments, oldest first.
  $lines = @('# Ryan''s site comments - work these before the next plan capability', '',
    'Each line is an open GitHub issue made from a comment Ryan left on the live site. Read it with',
    '`gh issue view <number> --repo Angriff36/capsule`, do what it asks, and commit with "Fixes #<number>".', '')
  foreach ($thread in $open) {
    $issue = $byThread[$thread.id]
    if ($issue -and $issue.state -ne 'CLOSED') {
      $short = ($thread.messages[0].text.Trim() -replace '\s+', ' ')
      if ($short.Length -gt 140) { $short = $short.Substring(0, 137) + '...' }
      $lines += "- #$($issue.number) $($thread.context.path): $short"
    }
  }
  Set-Content $queue ($lines -join "`n")
  Say "$($open.Count) open comments; $made new issues; $done marked done"
} catch {
  Say "failed: $($_.Exception.Message)"
}
exit 0
