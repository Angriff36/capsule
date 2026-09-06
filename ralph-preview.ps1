param([int]$Port = 7812, [switch]$Ensure)
$ErrorActionPreference = 'Stop'
$previewRoot = (Resolve-Path $PSScriptRoot).Path.Replace('\', '/')
$previewUrl = "http://127.0.0.1:$Port"
function Test-PreviewCheckout {
    try {
        $module = (Invoke-WebRequest "$previewUrl/src/main.tsx" -UseBasicParsing -TimeoutSec 5).Content
        $encoded = [regex]::Match($module, 'sourceMappingURL=data:application/json;base64,([^\s]+)').Groups[1].Value
        $map = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json
        return $map.file.Replace('\', '/') -eq "$previewRoot/src/main.tsx"
    } catch { return $false }
}
if (Test-PreviewCheckout) {
    Write-Output "Preview verified: $previewUrl serves $previewRoot"
    exit 0
}
if (-not $Ensure) { throw "Preview missing or wrong checkout at $previewUrl. Run this script with -Ensure to start it." }
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is occupied by another server. Choose a free port and update RALPH_PREVIEW_CHECK_CMD." }
$viteEntry = Join-Path $PSScriptRoot 'node_modules/vite/bin/vite.js'
if (-not (Test-Path $viteEntry)) { throw 'Install project dependencies before starting preview.' }
$logDir = Join-Path $PSScriptRoot '.artifacts'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$previewProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList @(
    "`"$viteEntry`"", "`"$PSScriptRoot`"", '--host', '127.0.0.1', '--port', "$Port", '--strictPort'
) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $logDir 'ralph-preview.log') `
  -RedirectStandardError (Join-Path $logDir 'ralph-preview.err.log')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-PreviewCheckout) {
        Write-Output "Preview verified: $previewUrl serves $previewRoot (PID $($previewProcess.Id))"
        exit 0
    }
    if ($previewProcess.HasExited) { throw 'Preview exited; inspect .artifacts/ralph-preview.err.log.' }
    Start-Sleep -Milliseconds 500
}
throw 'Preview did not become ready; inspect .artifacts/ralph-preview.err.log.'
