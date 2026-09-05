$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $ProjectRoot

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

Import-DotEnv (Join-Path $ProjectRoot ".env")

if (-not $env:APP_ENV) { $env:APP_ENV = "local" }
if (-not $env:BACKEND_PORT -and $env:PORT) { $env:BACKEND_PORT = $env:PORT }
$port = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5191" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required for the React/Vite frontend. Install Node.js, then run scripts/local/setup.ps1."
}

$env:NPM_CONFIG_CACHE = Join-Path $ProjectRoot ".npm-cache"
if (-not (Test-Path "frontend\node_modules")) {
  Write-Host "Installing frontend dependencies from the configured npm registry..."
  Push-Location frontend
  try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
  }
  finally {
    Pop-Location
  }
}

Push-Location frontend
try {
  npm run dev -- --host 127.0.0.1 --port $port
}
finally {
  Pop-Location
}
