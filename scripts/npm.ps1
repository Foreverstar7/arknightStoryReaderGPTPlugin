$ErrorActionPreference = 'Stop'
if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) { throw 'On macOS/Linux run sh scripts/npm.sh instead.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.node-version') -Raw).Trim()
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
$runtimeRoot = Join-Path $projectRoot ".local/toolchain/node-v$nodeVersion-win-$architecture"
$nodeExecutable = Join-Path $runtimeRoot 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Run ./scripts/setup-toolchain.ps1 first, or use your version manager with .node-version.' }
$env:Path = "$runtimeRoot;$env:Path"
& $nodeExecutable (Join-Path $runtimeRoot 'node_modules/npm/bin/npm-cli.js') @args
exit $LASTEXITCODE
