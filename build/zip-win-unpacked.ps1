param(
    [string]$SourceDir = "",
    [string]$ZipPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$gatewayDir = Join-Path $repoRoot "GatewayService"

if (-not $SourceDir) {
    $SourceDir = Join-Path $gatewayDir "out\memoQ AI Gateway-win32-x64"
}

if (-not $ZipPath) {
    $ZipPath = Join-Path $gatewayDir "out\memoq-ai-gateway-win32-x64.zip"
}

if (-not (Test-Path $SourceDir)) {
    throw "Packaged desktop directory not found: $SourceDir"
}

if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}

Compress-Archive -Path (Join-Path $SourceDir "*") -DestinationPath $ZipPath -Force
Write-Host "Created zip artifact: $ZipPath"
