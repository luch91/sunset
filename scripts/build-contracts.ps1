$ErrorActionPreference = "Stop"

$workspacePath = Split-Path -Parent $PSScriptRoot
Set-Location $workspacePath

cargo build --target wasm32-unknown-unknown --release -p sunset-institution
cargo build --target wasm32-unknown-unknown --release -p sunset-factory

$institutionWasm = Join-Path $workspacePath "target\wasm32-unknown-unknown\release\sunset_institution.wasm"
$factoryWasm = Join-Path $workspacePath "target\wasm32-unknown-unknown\release\sunset_factory.wasm"

if (!(Test-Path -LiteralPath $institutionWasm) -or !(Test-Path -LiteralPath $factoryWasm)) {
  throw "Expected contract artifacts were not produced."
}

[pscustomobject]@{
  source_commit = (git rev-parse HEAD).Trim()
  institution_wasm = $institutionWasm
  institution_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $institutionWasm).Hash.ToLowerInvariant()
  factory_wasm = $factoryWasm
  factory_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $factoryWasm).Hash.ToLowerInvariant()
} | ConvertTo-Json
