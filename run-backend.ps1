$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $key, $value = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim().Trim('"').Trim("'"), "Process")
  }
}

Import-DotEnv (Join-Path $PSScriptRoot ".env")

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  throw "uv is required. Install uv, then run setup.ps1."
}

$port = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8029" }
$env:UV_CACHE_DIR = Join-Path $PSScriptRoot ".uv-cache"
uv run uvicorn app.main:app --host 127.0.0.1 --port $port
