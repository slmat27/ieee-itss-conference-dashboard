$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $key, $value = $line.Split("=", 2)
    $key = $key.Trim()
    if ($null -eq [Environment]::GetEnvironmentVariable($key, "Process")) {
      [Environment]::SetEnvironmentVariable($key, $value.Trim().Trim('"').Trim("'"), "Process")
    }
  }
}

Import-DotEnv (Join-Path $PSScriptRoot ".env")

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  throw "uv is required. Install uv, then run setup.ps1."
}

if (-not $env:APP_ENV) { $env:APP_ENV = "local" }
if (-not $env:HOST) { $env:HOST = "127.0.0.1" }
$port = if ($env:PORT) { $env:PORT } elseif ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8029" }
$env:PORT = $port
$env:BACKEND_PORT = $port
$env:UV_CACHE_DIR = Join-Path $PSScriptRoot ".uv-cache"
uv run python -m app.server
