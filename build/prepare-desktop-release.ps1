param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$gatewayDir = Join-Path $repoRoot "GatewayService"
$stagingRoot = Join-Path $gatewayDir "build-resources"
$integrationDir = Join-Path $stagingRoot "memoq-integration"
$pluginCandidates = @(
    (Join-Path $repoRoot "MultiSupplierMTPlugin\bin\Any CPU\$Configuration\net48\MemoQ.AIGateway.Plugin.dll"),
    (Join-Path $repoRoot "MultiSupplierMTPlugin\bin\$Configuration\net48\MemoQ.AIGateway.Plugin.dll")
)
$pluginSource = $pluginCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$clientDevConfig = Join-Path $repoRoot "doc\ClientDevConfig.xml"

if (-not $pluginSource) {
    throw "Built plugin DLL not found. Checked: $($pluginCandidates -join ', ')"
}

if (-not (Test-Path $clientDevConfig)) {
    throw "ClientDevConfig.xml not found: $clientDevConfig"
}

New-Item -ItemType Directory -Force -Path $integrationDir | Out-Null
Copy-Item -Force $pluginSource (Join-Path $integrationDir "MemoQ.AIGateway.Plugin.dll")
Copy-Item -Force $clientDevConfig (Join-Path $integrationDir "ClientDevConfig.xml")

Write-Host "Prepared desktop release resources:"
Write-Host "  - Plugin: $pluginSource"
Write-Host "  - Staging: $integrationDir"
