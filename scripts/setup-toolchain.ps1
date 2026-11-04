$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.node-version') -Raw).Trim()
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$npmVersion = $package.packageManager -replace '^npm@', ''
if ($nodeVersion -notmatch '^\d+\.\d+\.\d+$' -or $npmVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Toolchain versions must be exact stable versions.' }
if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) { throw 'On macOS/Linux run sh scripts/setup-toolchain.sh.' }
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($architecture -notin @('x64', 'arm64')) { throw "Unsupported architecture: $architecture" }
$toolchainRoot = Join-Path $projectRoot '.local/toolchain'
$distributionName = "node-v$nodeVersion-win-$architecture"
$runtimeRoot = Join-Path $toolchainRoot $distributionName
$nodeExecutable = Join-Path $runtimeRoot 'node.exe'
$archive = Join-Path $toolchainRoot "$distributionName.zip"
$downloadRoot = "https://nodejs.org/dist/v$nodeVersion"
New-Item -ItemType Directory -Force -Path $toolchainRoot | Out-Null
if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  $checksums = (Invoke-WebRequest -Uri "$downloadRoot/SHASUMS256.txt" -TimeoutSec 30).Content
  $entry = ($checksums -split "`n" | Where-Object { $_.Trim().EndsWith(" $distributionName.zip") })
  if (@($entry).Count -ne 1) { throw 'Official checksum entry is missing or ambiguous.' }
  $expected = ($entry.Trim() -split '\s+')[0]
  Write-Output "Downloading official Node.js $nodeVersion ($architecture)..."
  Invoke-WebRequest -Uri "$downloadRoot/$distributionName.zip" -OutFile $archive -TimeoutSec 60
  $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if ($actual -ne $expected) { throw 'Official Node archive checksum mismatch. Nothing will be executed.' }
  Expand-Archive -LiteralPath $archive -DestinationPath $toolchainRoot -Force
}
$env:Path = "$runtimeRoot;$env:Path"
$npmCli = Join-Path $runtimeRoot 'node_modules/npm/bin/npm-cli.js'
$installedNpm = & $nodeExecutable $npmCli --version
if ($installedNpm -ne $npmVersion) {
  & $nodeExecutable $npmCli install --global "npm@$npmVersion" --prefix $runtimeRoot --fetch-retries=0 --fetch-timeout=20000
  if ($LASTEXITCODE -ne 0) { throw 'Pinned npm installation failed.' }
}
& $nodeExecutable --version
& $nodeExecutable $npmCli --version
