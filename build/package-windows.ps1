param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$gatewayDir = Join-Path $repoRoot "GatewayService"

function Assert-LastExitCode {
    param(
        [string]$StepName
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$StepName failed with exit code $LASTEXITCODE."
    }
}

function Resolve-PythonForNodeGyp {
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

    return ""
}

Write-Host "Building memoQ plugin..."
& (Join-Path $repoRoot "scripts\build-windows.ps1") -Configuration $Configuration
Assert-LastExitCode "Plugin build"

Write-Host "Preparing desktop release resources..."
& (Join-Path $repoRoot "build\prepare-desktop-release.ps1") -Configuration $Configuration
Assert-LastExitCode "Prepare desktop release resources"

Push-Location $gatewayDir
try {
    $pythonForNodeGyp = Resolve-PythonForNodeGyp
    if ($pythonForNodeGyp) {
        $env:PYTHON = $pythonForNodeGyp
        $env:npm_config_python = $pythonForNodeGyp
        Write-Host "Using Python for node-gyp: $pythonForNodeGyp"
    }

    Write-Host "Preparing bundled LiteLLM runtime..."
    & (Join-Path $repoRoot "build\prepare-litellm-runtime.ps1") -PythonBin $pythonForNodeGyp
    Assert-LastExitCode "Prepare bundled LiteLLM runtime"

    Write-Host "Installing desktop dependencies..."
    npm install
    Assert-LastExitCode "npm install"

    Write-Host "Running desktop tests..."
    npm test
    Assert-LastExitCode "npm test"

    Write-Host "Packaging Windows desktop app directory..."
    npm run package
    Assert-LastExitCode "npm run package"

    Write-Host "Creating packaged desktop zip artifact..."
    npm run zip:win-unpacked
    Assert-LastExitCode "npm run zip:win-unpacked"

    Write-Host "Packaging Windows desktop installers..."
    npm run make
    Assert-LastExitCode "npm run make"
}
finally {
    Pop-Location
}
