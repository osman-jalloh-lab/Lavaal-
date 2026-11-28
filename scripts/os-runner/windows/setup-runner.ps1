# scripts/os-runner/windows/setup-runner.ps1 - set up the LAVAALL OS builder runner on a Windows PC (run once).
#
# What it does, in order, and it stops at the first problem:
#   1. checks git, node 20+, gh, claude and codex are installed
#   2. checks gh is logged in to GitHub
#   3. checks the Claude Code and Codex logins exist (it never prints them)
#   4. gets a copy of the repo in %USERPROFILE%\lavaall-runner
#   5. asks for the two KV settings from Vercel (the token is typed hidden) and saves them to
#      %USERPROFILE%\.lavaall-runner.env, readable only by you
#   6. runs one tick with the runner OFF, to prove it starts
# It never turns the runner on. start-runner.ps1 does that, only while it is open.
#
# Run it from PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\setup-runner.ps1
$ErrorActionPreference = 'Stop'

function Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    ok: $text" -ForegroundColor Green }
function Stop-Setup($text) { Write-Host "    STOP: $text" -ForegroundColor Red; exit 1 }

Step 1 'Checking the tools'
foreach ($tool in @('git', 'node', 'gh', 'claude', 'codex')) {
  $cmd = Get-Command $tool -ErrorAction SilentlyContinue
  if (-not $cmd) {
    if ($tool -eq 'codex' -or $tool -eq 'claude') { Write-Host "    missing: $tool (builds with it will not run until it is installed)" -ForegroundColor Yellow; continue }
    Stop-Setup "$tool is not installed. Install it, open a new PowerShell window, and run this again."
  }
  $version = (& $tool --version 2>$null | Select-Object -First 1)
  Ok "$tool $version"
}
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]") 2>$null)
if ($nodeMajor -lt 20) { Stop-Setup "Node $nodeMajor is too old. Install Node 20 or newer." }

Step 2 'Checking GitHub'
& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-Setup 'gh is not logged in. Run: gh auth login   (pick GitHub.com, HTTPS, log in with a browser), then run this again.' }
Ok 'gh is logged in'

Step 3 'Checking the builder logins (not printed)'
$claudeLogin = Join-Path $env:USERPROFILE '.claude\.credentials.json'
$codexLogin = Join-Path $env:USERPROFILE '.codex\auth.json'
if ((Test-Path $claudeLogin) -and ((Get-Item $claudeLogin).Length -gt 0)) { Ok 'Claude Code is logged in' }
else { Write-Host '    Claude Code is not logged in. Run: claude   then type /login, finish in the browser, then /exit.' -ForegroundColor Yellow }
if ((Test-Path $codexLogin) -and ((Get-Item $codexLogin).Length -gt 0)) { Ok 'Codex is logged in' }
else { Write-Host '    Codex is not logged in. Run: codex login' -ForegroundColor Yellow }
if (-not (Test-Path $claudeLogin) -and -not (Test-Path $codexLogin)) { Stop-Setup 'Log in to at least one builder (Claude Code or Codex), then run this again.' }

Step 4 'Getting the repo'
$repo = Join-Path $env:USERPROFILE 'lavaall-runner'
if (Test-Path (Join-Path $repo '.git')) {
  & git -C $repo pull --ff-only
  if ($LASTEXITCODE -ne 0) { Stop-Setup "Could not update $repo. Delete that folder and run this again." }
  Ok "updated $repo"
} else {
  & git clone https://github.com/osman-jalloh-lab/Lavaal-.git $repo
  if ($LASTEXITCODE -ne 0) { Stop-Setup 'Could not clone the repo. Check gh auth login and your internet.' }
  Ok "cloned to $repo"
}

Step 5 'Saving the KV settings'
$envFile = Join-Path $env:USERPROFILE '.lavaall-runner.env'
$stopFile = Join-Path $env:USERPROFILE '.os-runner-stop'
$keep = $false
if (Test-Path $envFile) { $keep = (Read-Host '    A settings file already exists. Keep it? (Y/n)') -notmatch '^[nN]' }
if (-not $keep) {
  Write-Host '    In Vercel: project lavaal > Settings > Environment Variables. Copy the two values below.'
  $url = Read-Host '    KV_REST_API_URL'
  if ($url -notmatch '^https://') { Stop-Setup 'That does not look like the KV URL (it starts with https://).' }
  $secure = Read-Host '    KV_REST_API_TOKEN (hidden)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if (-not $token) { Stop-Setup 'The token was empty.' }
  $lines = @(
    "KV_REST_API_URL=$url",
    "KV_REST_API_TOKEN=$token",
    'OS_BUILDER_MONTHLY_CAP_USD=50',
    "OS_RUNNER_STOP_FILE=$stopFile"
  )
  # Plain text without a byte-order mark, so every line reads back cleanly.
  [System.IO.File]::WriteAllLines($envFile, [string[]]$lines)
  $token = $null
  # Only you can read or change it.
  & icacls $envFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  Ok "saved $envFile (only $($env:USERNAME) can read it)"
}

Step 6 'Checking the runner starts (it stays OFF)'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2] }
}
Remove-Item Env:OS_RUNNER_ENABLED -ErrorAction SilentlyContinue
Push-Location $repo
try { $out = & node scripts\os-runner\index.js tick } finally { Pop-Location }
if ($out -notmatch '"state":"disabled"') { Stop-Setup "Unexpected answer from the runner: $out" }
Ok 'the runner starts and is off'

Write-Host "`nAll set. To let the OS build on this PC, run:" -ForegroundColor Green
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$repo\scripts\os-runner\windows\start-runner.ps1`""
Write-Host 'Leave that window open while you want builds. Close it (or create the stop file) to stop.'
