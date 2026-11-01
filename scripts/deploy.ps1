<#
  Build AuraClip and install it over the running copy.

    pnpm run deploy                               build, install, restart, back up source
    powershell -File scripts/deploy.ps1 -SkipBuild   install the last release build
    powershell -File scripts/deploy.ps1 -NoRestart   install but do not start the app

  (`pnpm deploy` without `run` is pnpm's own workspace command, not this script.)

  Release builds must enable tauri/custom-protocol; without it the exe loads
  http://localhost:1420 instead of the embedded frontend.
#>
param(
    [string]$InstallDir = 'D:\!SOFTWARE\AuraClip',
    [switch]$SkipBuild,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$built = Join-Path $repo 'src-tauri\target\release\auraclip-app.exe'
$installed = Join-Path $InstallDir 'auraclip.exe'
$latestDir = Join-Path $InstallDir 'maintenance\latest'
$latest = Join-Path $latestDir 'auraclip.exe'

function Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }

function Invoke-Checked($exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') failed (exit $LASTEXITCODE)" }
}

Push-Location $repo
try {
    if (-not $SkipBuild) {
        Step 'Frontend build (pnpm build)'
        Invoke-Checked 'pnpm' @('build')
        Step 'Release build (cargo, tauri/custom-protocol)'
        Invoke-Checked 'cargo' @('build', '--manifest-path', 'src-tauri/Cargo.toml', '--release',
            '--features', 'tauri/custom-protocol', '--bin', 'auraclip-app')
    }
    if (-not (Test-Path $built)) { throw "Build output not found: $built" }

    Step 'Stopping running AuraClip'
    $running = Get-Process -Name 'auraclip', 'auraclip-app' -ErrorAction SilentlyContinue
    if ($running) {
        # The logon task starts AuraClip elevated; a normal shell cannot stop
        # it, but ending the task can when the task started this instance.
        & cmd.exe /c 'schtasks /End /TN "\AuraClip\ElevatedAutostart" >nul 2>nul'
        $running | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue
        $running = Get-Process -Name 'auraclip', 'auraclip-app' -ErrorAction SilentlyContinue
    }
    if ($running) {
        try { $running | Stop-Process -Force -ErrorAction Stop }
        catch { throw 'AuraClip runs as administrator. Quit it from the tray menu (退出应用), then rerun with -SkipBuild.' }
        $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

    Step "Installing to $installed and $latest"
    New-Item -ItemType Directory -Force -Path $InstallDir, $latestDir | Out-Null
    Copy-Item $built $installed -Force
    Copy-Item $built $latest -Force

    Step 'Verifying SHA256'
    $expected = (Get-FileHash $built -Algorithm SHA256).Hash
    foreach ($copy in @($installed, $latest)) {
        $actual = (Get-FileHash $copy -Algorithm SHA256).Hash
        if ($actual -ne $expected) { throw "Hash mismatch for $copy" }
    }
    Write-Host "    $expected"

    if (-not $NoRestart) {
        Step 'Starting AuraClip'
        # Prefer the elevated logon task so the app keeps admin rights; the
        # pre-rename task name stays until AuraClip runs elevated once.
        # cmd keeps schtasks' "not found" on stderr from stopping the script.
        $started = $false
        foreach ($task in '\AuraClip\ElevatedAutostart', '\TieZ\ElevatedAutostart') {
            & cmd.exe /c "schtasks /Run /TN `"$task`" >nul 2>nul"
            if ($LASTEXITCODE -eq 0) { $started = $true; break }
        }
        if (-not $started) { Start-Process -FilePath $installed -WorkingDirectory $InstallDir }
    }

    $backupScript = Join-Path $InstallDir 'maintenance\backup_source.py'
    if (Test-Path $backupScript) {
        Step 'Backing up source'
        Invoke-Checked 'python' @($backupScript)
    }

    Step 'Done'
}
finally {
    Pop-Location
}
