# Portable build: a `data` folder next to the exe holds all user data.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'pnpm build failed' }
    & cargo build --manifest-path src-tauri/Cargo.toml --release --features 'tauri/custom-protocol portable' --bin auraclip-app
    if ($LASTEXITCODE -ne 0) { throw 'cargo build failed' }

    $out = Join-Path $repo 'artifacts\portable'
    if (Test-Path $out) { Remove-Item -Recurse -Force $out }
    New-Item -ItemType Directory -Force -Path (Join-Path $out 'data') | Out-Null
    Copy-Item 'src-tauri\target\release\auraclip-app.exe' (Join-Path $out 'auraclip.exe') -Force
    Set-Content -Path (Join-Path $out 'README.txt') -Encoding UTF8 -Value @(
        'AuraClip portable. Data is stored in the data folder next to auraclip.exe.',
        'To update, replace auraclip.exe and keep the data folder.'
    )
    Compress-Archive -Path (Join-Path $out '*') -DestinationPath (Join-Path $out 'AuraClip-portable.zip') -Force
    Write-Host "Portable build: $out"
}
finally {
    Pop-Location
}
