# scripts/os-runner/windows/start-runner.ps1 - let the LAVAALL OS build on this PC while this window is open.
#
# It loads %USERPROFILE%\.lavaall-runner.env, turns the runner on for this window only, and runs three loops
# (one per builder: Codex, Claude Sonnet, Claude Opus can each work on a job at once; each builder has its own lock).
# Every loop asks the OS for a job every 20 seconds. Builds open DRAFT pull requests only; nothing is merged or deployed.
#
# Stop it: close this window, press Ctrl+C, or create the stop file:
#   New-Item "$env:USERPROFILE\.os-runner-stop"
#
# Run it from PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\start-runner.ps1
$ErrorActionPreference = 'Stop'

$repo = Join-Path $env:USERPROFILE 'lavaall-runner'
$envFile = Join-Path $env:USERPROFILE '.lavaall-runner.env'
$stopFile = Join-Path $env:USERPROFILE '.os-runner-stop'
if (-not (Test-Path $envFile)) { Write-Host 'Run setup-runner.ps1 first.' -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $repo '.git'))) { Write-Host "No repo at $repo. Run setup-runner.ps1 first." -ForegroundColor Red; exit 1 }
if (Test-Path $stopFile) {
  if ((Read-Host 'The stop file is there, so the runner is paused. Remove it and start? (y/N)') -match '^[yY]') { Remove-Item $stopFile }
  else { exit 0 }
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2] }
}
if (-not $env:OS_RUNNER_STOP_FILE) { $env:OS_RUNNER_STOP_FILE = $stopFile }
# On for this window and the loops it starts. Never saved to the settings file.
$env:OS_RUNNER_ENABLED = '1'

Write-Host 'Getting the latest runner code...'
& git -C $repo pull --ff-only | Out-Null

$loop = {
  param($repo, $stopFile, $n)
  Set-Location $repo
  while (-not (Test-Path $stopFile)) {
    $out = & node scripts\os-runner\index.js tick 2>$null
    if ($out -and $out -notmatch '"state":"(idle|disabled)"') { "[builder loop $n] $(Get-Date -Format 'HH:mm:ss') $out" }
    Start-Sleep -Seconds 20
  }
}

$jobs = foreach ($i in 1..3) { Start-Job -ScriptBlock $loop -ArgumentList $repo, $env:OS_RUNNER_STOP_FILE, $i }
Write-Host "The OS can build on this PC now ($($jobs.Count) builder loops). Leave this window open." -ForegroundColor Green
Write-Host 'Stop: close this window, press Ctrl+C, or create the stop file.'
try {
  while (-not (Test-Path $env:OS_RUNNER_STOP_FILE)) {
    $jobs | Receive-Job | ForEach-Object { Write-Host $_ }
    Start-Sleep -Seconds 5
  }
  # The stop file is the gentle way: each loop finishes the build it is on, then ends.
  Write-Host 'Stop file found. Letting any build in progress finish...' -ForegroundColor Yellow
  $jobs | Wait-Job | Out-Null
  $jobs | Receive-Job | ForEach-Object { Write-Host $_ }
} finally {
  # Ctrl+C or closing the window ends any build at once; its lock expires on its own and the job shows as failed.
  $jobs | Stop-Job -ErrorAction SilentlyContinue
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
  Write-Host 'The runner is off.'
}
