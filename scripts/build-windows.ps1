param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [ValidateSet("Any CPU", "x64", "AnyCPU", "x86")]
    [string]$Platform = "Any CPU",
    [string]$Solution = "MT_SDK.sln",
    [int]$LegacyNuGetTimeoutSec = 300,
    [switch]$SkipSourceUnblock,
    [switch]$SkipLegacyNuGetRestore,
    [switch]$SkipRestore,
    [switch]$IncludeDllGenerator
)

$ErrorActionPreference = "Stop"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$repoRoot = Split-Path -Parent $PSScriptRoot
$solutionPath = Join-Path $repoRoot $Solution

if (-not (Test-Path $solutionPath)) {
    throw "solution not found: $solutionPath"
}

function Get-SimpleEnvPath {
    param([string]$Name)

    $entry = Get-Item "Env:$Name" -ErrorAction SilentlyContinue
    if (-not $entry) {
        return $null
    }

    $value = $entry.Value
    if ($null -eq $value) {
        return $null
    }

    if ($value -is [System.Array]) {
        if ($value.Length -eq 0) {
            return $null
        }
        $value = $value[0]
    }

    return [string]$value
}

function Join-PathSafe {
    param(
        [object]$BasePath,
        [object]$ChildPath
    )

    if ($null -eq $BasePath -or $null -eq $ChildPath) {
        return $null
    }

    if ($BasePath -is [System.Array]) {
        if ($BasePath.Count -eq 0) { return $null }
        $BasePath = $BasePath[0]
    }

    if ($ChildPath -is [System.Array]) {
        if ($ChildPath.Count -eq 0) { return $null }
        $ChildPath = $ChildPath[0]
    }

    if ([string]::IsNullOrWhiteSpace([string]$BasePath) -or [string]::IsNullOrWhiteSpace([string]$ChildPath)) {
        return $null
    }

    return [System.IO.Path]::Combine([string]$BasePath, [string]$ChildPath)
}

function Find-MsBuild {
    $candidates = @()

    $programFilesX86 = Get-SimpleEnvPath "ProgramFiles(x86)"
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        $vswhere = Join-PathSafe $programFilesX86 "Microsoft Visual Studio\Installer\vswhere.exe"
        if (Test-Path $vswhere) {
            $path = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" 2>$null
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($path)) {
                $candidates += $path
            }
        }
    }
    $programFiles = Get-SimpleEnvPath "ProgramFiles"
    if ([string]::IsNullOrWhiteSpace($programFiles)) {
        $programFiles = $null
    }

    if ($programFiles) {
        $candidates += @(
            Join-PathSafe $programFiles "Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
            Join-PathSafe $programFiles "Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
            Join-PathSafe $programFiles "Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
            Join-PathSafe $programFiles "Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\MSBuild.exe",
            Join-PathSafe $programFiles "Microsoft Visual Studio\2019\Professional\MSBuild\Current\Bin\MSBuild.exe",
            Join-PathSafe $programFiles "Microsoft Visual Studio\2019\Enterprise\MSBuild\Current\Bin\MSBuild.exe"
        )
    }

    foreach ($item in $candidates) {
        if (Test-Path $item) { return $item }
    }

    throw "MSBuild.exe not found. Please open Visual Studio Installer and install the .NET desktop build workload."
}

function Expand-Output {
    param(
        [string]$Path
    )
    if (Test-Path $Path) {
        Write-Host "  - $Path"
    } else {
        Write-Warning "  - not found: $Path"
    }
}

function Find-NuGet {
    $programFiles = Get-SimpleEnvPath "ProgramFiles"
    if ([string]::IsNullOrWhiteSpace($programFiles)) {
        $programFiles = $null
    }
    $programFilesX86 = Get-SimpleEnvPath "ProgramFiles(x86)"
    if ([string]::IsNullOrWhiteSpace($programFilesX86)) {
        $programFilesX86 = $null
    }
    $chocoInstall = Get-SimpleEnvPath "ChocolateyInstall"
    if ([string]::IsNullOrWhiteSpace($chocoInstall)) {
        $chocoInstall = Get-Item Env:ChocolateyInstall -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Value -ErrorAction SilentlyContinue
    }
    $localAppData = Get-SimpleEnvPath "LOCALAPPDATA"
    if ([string]::IsNullOrWhiteSpace($localAppData)) {
        $localAppData = $null
    }
    $repoRootCandidate = Get-Item Env:BUILD_WINDOWS_REPO_ROOT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Value -ErrorAction SilentlyContinue

    $candidates = @()
    $command = Get-Command nuget -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }

    if ($programFiles) { $candidates += Join-PathSafe $programFiles "NuGet\nuget.exe" }
    if ($programFilesX86) { $candidates += Join-PathSafe $programFilesX86 "NuGet\nuget.exe" }
    if ($chocoInstall) { $candidates += Join-PathSafe $chocoInstall "bin\nuget.exe" }
    if ($localAppData) { $candidates += Join-PathSafe $localAppData "Microsoft\WindowsApps\nuget.exe" }
    if ($repoRootCandidate) { $candidates += Join-PathSafe $repoRootCandidate "scripts\tools\nuget.exe" }
    $candidates += Join-PathSafe $PSScriptRoot "nuget.exe"
    $candidates += Join-PathSafe $PSScriptRoot "..\..\tools\nuget\nuget.exe"

    foreach ($path in $candidates) {
        if ([string]::IsNullOrWhiteSpace($path)) { continue }
        if (Test-Path $path) { return $path }
    }

    return $null
}

function Ensure-NuGetCli {
    param([string]$RepoRoot)

    $nuget = Find-NuGet
    if ($nuget) { return $nuget }

    Write-Host "nuget.exe not found, downloading bootstrap nuget.exe..."
    $toolDir = Join-Path $RepoRoot "scripts\tools"
    if (-not (Test-Path $toolDir)) {
        New-Item -ItemType Directory -Path $toolDir -Force | Out-Null
    }

    $nugetPath = Join-Path $toolDir "nuget.exe"
    $url = "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe"
    if (Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue) {
        Invoke-WebRequest -Uri $url -OutFile $nugetPath -UseBasicParsing
        return $nugetPath
    }

    if (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue) {
        Start-BitsTransfer -Source $url -Destination $nugetPath
        return $nugetPath
    }

    return $null
}

function Invoke-NuGetRestore {
    param(
        [Parameter(Mandatory)]
        [string]$NuGetPath,
        [Parameter(Mandatory)]
        [string]$SolutionPath,
        [Parameter(Mandatory)]
        [string]$PackagesPath,
        [int]$TimeoutSeconds = 300
    )

    $logFile = Join-Path $env:TEMP ("nuget-restore-{0}.log" -f ([guid]::NewGuid().ToString("N")))
    $arguments = @(
        "restore",
        "`"$SolutionPath`"",
        "-PackagesDirectory",
        "`"$PackagesPath`"",
        "-NonInteractive",
        "-Verbosity",
        "detailed"
    )

    Write-Host "Running: $NuGetPath $($arguments -join " ")"
    Write-Host "NuGet restore log: $logFile"

    $proc = Start-Process -FilePath $NuGetPath -ArgumentList $arguments `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError $logFile `
        -NoNewWindow `
        -PassThru

    $completed = $proc.WaitForExit($TimeoutSeconds * 1000)
    if (-not $completed) {
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Verbose "Failed to terminate hung nuget.exe: $($_.Exception.Message)"
        }
        throw "nuget restore timed out after $TimeoutSeconds seconds."
    }

    if ($proc.ExitCode -ne 0) {
        if (Test-Path $logFile) {
            Write-Host (Get-Content $logFile -Raw)
        }
        throw "nuget restore failed with exit code $($proc.ExitCode)."
    }

    if (Test-Path $logFile) {
        Write-Host (Get-Content $logFile -Raw)
    }
}

function Unblock-DownloadedAssemblies {
    param([string]$TargetPath)

    if (-not (Test-Path $TargetPath)) {
        return
    }

    $assemblies = Get-ChildItem -Path $TargetPath -Recurse -File -Include *.dll,*.exe -ErrorAction SilentlyContinue
    foreach ($assembly in $assemblies) {
        $zoneStream = "$($assembly.FullName):Zone.Identifier"
        try {
            if (Get-Item $assembly.FullName -Stream "Zone.Identifier" -ErrorAction SilentlyContinue) {
                Remove-Item $zoneStream -ErrorAction SilentlyContinue
            }
            else {
                Unblock-File -Path $assembly.FullName -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Verbose "Failed to unblock $($assembly.FullName): $($_.Exception.Message)"
        }
    }
}

function Unblock-SourceFiles {
    param(
        [Parameter(Mandatory)]
        [string]$TargetPath
    )

    if (-not (Test-Path $TargetPath)) {
        return
    }

    $patterns = @("*.resx", "*.cs", "*.csproj", "*.sln", "*.config", "*.xml", "*.json", "*.props", "*.targets")
    $sourceFiles = Get-ChildItem -Path $TargetPath -Recurse -File -ErrorAction SilentlyContinue

    foreach ($file in $sourceFiles) {
        if ([System.IO.Path]::GetExtension($file.Name).ToLowerInvariant() -notin ([string[]]$patterns -replace '\*', '')) {
            continue
        }

        $zoneStream = "$($file.FullName):Zone.Identifier"
        try {
            if (Get-Item $file.FullName -Stream "Zone.Identifier" -ErrorAction SilentlyContinue) {
                Remove-Item $zoneStream -ErrorAction SilentlyContinue
            }
            else {
                Unblock-File -Path $file.FullName -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Verbose "Failed to unblock source file $($file.FullName): $($_.Exception.Message)"
        }
    }

    # Explicitly target known problematic resource files used by resource generators.
    $dllGeneratorResx = Get-ChildItem -Path (Join-Path $TargetPath "DllGenerator") -Recurse -File -Filter "*.resx" -ErrorAction SilentlyContinue
    foreach ($resourceFile in $dllGeneratorResx) {
        $zoneStream = "$($resourceFile.FullName):Zone.Identifier"
        try {
            if (Get-Item $resourceFile.FullName -Stream "Zone.Identifier" -ErrorAction SilentlyContinue) {
                Remove-Item $zoneStream -ErrorAction SilentlyContinue
            }
            else {
                Unblock-File -Path $resourceFile.FullName -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Verbose "Failed to unblock resource file $($resourceFile.FullName): $($_.Exception.Message)"
        }
    }
}

function Ensure-LegacyNugetPackages {
    param([string]$solutionRoot)

    $requiredTargets = @(
        Join-Path $solutionRoot "packages\Fody.6.5.5\build\Fody.targets"
    )

    $needRestore = $false
    foreach ($target in $requiredTargets) {
        if (-not (Test-Path $target)) {
            $needRestore = $true
            break
        }
    }
    if (-not $needRestore) {
        Unblock-DownloadedAssemblies -TargetPath (Join-Path $solutionRoot "packages")
        return
    }

    $nuget = Ensure-NuGetCli -RepoRoot $solutionRoot
    if (-not $nuget) {
        Write-Warning "nuget.exe not found; skipping legacy package restore for packages.config projects."
        Write-Warning "Please install/locate nuget.exe, then run: nuget restore `"$solutionPath`""
        return
    }

    Write-Host "Restoring legacy NuGet packages: $nuget"
    Invoke-NuGetRestore -NuGetPath $nuget -SolutionPath $solutionPath -PackagesPath (Join-Path $solutionRoot "packages") -TimeoutSeconds $LegacyNuGetTimeoutSec
    Unblock-DownloadedAssemblies -TargetPath (Join-Path $solutionRoot "packages")
}

$msbuild = Find-MsBuild
$platformArg = $Platform.Replace(" ", "")
if ($platformArg -eq "AnyCPU") { $platformArg = "Any CPU" }

Write-Host "Using MSBuild: $msbuild"
Write-Host "Building: $(if ($IncludeDllGenerator) { $solutionPath } else { Join-Path $repoRoot \"MultiSupplierMTPlugin\\MultiSupplierMTPlugin.csproj\" })"
Write-Host "Configuration: $Configuration / Platform: $platformArg"

if (-not $SkipRestore) {
    Write-Host "Running NuGet restore..."
    if ($IncludeDllGenerator) {
        & $msbuild $solutionPath /m /t:Restore /p:Configuration=$Configuration /p:Platform=$platformArg
    }
    else {
        & $msbuild (Join-Path $repoRoot "MultiSupplierMTPlugin\MultiSupplierMTPlugin.csproj") /m /t:Restore /p:Configuration=$Configuration /p:Platform=$platformArg
    }
    if ($IncludeDllGenerator) {
        Write-Host "Checking legacy NuGet packages..."
        if (-not $SkipLegacyNuGetRestore) {
            Ensure-LegacyNugetPackages -solutionRoot $repoRoot
        } else {
            Write-Host "Skipping legacy NuGet restore."
        }
    }
    else {
        Write-Host "Skipping legacy NuGet restore (plugin-only build)."
    }
}

if (-not $SkipSourceUnblock) {
    Unblock-SourceFiles -TargetPath $repoRoot
}

Write-Host "Building $(if ($IncludeDllGenerator) { "solution" } else { "plugin only" })..."
if ($IncludeDllGenerator) {
    & $msbuild $solutionPath /m /p:Configuration=$Configuration /p:Platform=$platformArg
}
else {
    & $msbuild (Join-Path $repoRoot "MultiSupplierMTPlugin\MultiSupplierMTPlugin.csproj") /m /p:Configuration=$Configuration /p:Platform=$platformArg
}

Write-Host "Build done."

# memoQ loads plugin assemblies from Program Files; clear potential Zone.Identifier to avoid
# .NET network-location load restrictions (FileLoadException: Operation is not supported).
Write-Host "Unblocking plugin output before packaging..."
$pluginOutputDir = Join-Path $repoRoot "MultiSupplierMTPlugin\bin\$Configuration\net48"
Unblock-DownloadedAssemblies -TargetPath $pluginOutputDir

if ($IncludeDllGenerator) {
    $dllGeneratorOutputDir = Join-Path $repoRoot "DllGenerator\bin\$Configuration"
    Unblock-DownloadedAssemblies -TargetPath $dllGeneratorOutputDir
}

Write-Host "Expected outputs:"
Expand-Output (Join-Path $repoRoot "MultiSupplierMTPlugin\bin\$Configuration\net48\MemoQ.AIGateway.Plugin.dll")
if ($IncludeDllGenerator) {
    Expand-Output (Join-Path $repoRoot "DllGenerator\bin\$Configuration\Dll Generator.exe")
}
