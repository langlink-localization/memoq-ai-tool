param(
    [string]$PythonBin = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$gatewayDir = Join-Path $repoRoot "GatewayService"
$runtimeRoot = Join-Path $gatewayDir "build-resources\llmrt"
$runtimeDrive = if ($env:SystemDrive) { $env:SystemDrive } else { "C:" }
$actualRuntimeRoot = Join-Path $runtimeDrive "mqllmrt"
$legacyRuntimeRoot = Join-Path $gatewayDir "build-resources\litellm-runtime"

function Resolve-PythonBin {
    param(
        [string]$ExplicitPythonBin
    )

    if ($ExplicitPythonBin -and (Get-Command $ExplicitPythonBin -ErrorAction SilentlyContinue)) {
        return $ExplicitPythonBin
    }

    if ($env:PYTHON -and (Test-Path $env:PYTHON)) {
        return $env:PYTHON
    }

    $pyenvCommand = Get-Command pyenv -ErrorAction SilentlyContinue
    if ($pyenvCommand) {
        $pythonPath = (& $pyenvCommand.Source which python).Trim()
        if ($LASTEXITCODE -eq 0 -and $pythonPath -and (Test-Path $pythonPath)) {
            return $pythonPath
        }
    }

    $candidates = @("py", "python", "python3")
    foreach ($candidate in $candidates) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }

    throw "Python executable not found. Install Python via pyenv or set -PythonBin explicitly."
}

function Get-RuntimePythonPath {
    param(
        [string]$RuntimeDir
    )

    $candidates = @(
        (Join-Path $RuntimeDir "Scripts\python.exe"),
        (Join-Path $RuntimeDir "bin\python")
    )

    return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

$resolvedPython = Resolve-PythonBin -ExplicitPythonBin $PythonBin

if (Test-Path $legacyRuntimeRoot) {
    Remove-Item -Recurse -Force $legacyRuntimeRoot
}

if (Test-Path $runtimeRoot) {
    Remove-Item -Recurse -Force $runtimeRoot
}

if (Test-Path $actualRuntimeRoot) {
    Remove-Item -Recurse -Force $actualRuntimeRoot
}

Write-Host "Creating bundled LiteLLM runtime with Python: $resolvedPython"
& $resolvedPython -m venv $actualRuntimeRoot
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create LiteLLM virtual environment."
}

$runtimePython = Get-RuntimePythonPath -RuntimeDir $actualRuntimeRoot
if (-not $runtimePython) {
    throw "Bundled runtime python was not created under $actualRuntimeRoot"
}

Write-Host "Installing LiteLLM proxy runtime..."
& $runtimePython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip in bundled LiteLLM runtime."
}

& $runtimePython -m pip install "litellm[proxy]"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install litellm[proxy] into bundled runtime."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtimeRoot) | Out-Null
New-Item -ItemType Junction -Path $runtimeRoot -Target $actualRuntimeRoot | Out-Null

Write-Host "Prepared bundled LiteLLM runtime:"
Write-Host "  - Runtime root: $actualRuntimeRoot"
Write-Host "  - Staging link: $runtimeRoot"
Write-Host "  - Python: $runtimePython"
