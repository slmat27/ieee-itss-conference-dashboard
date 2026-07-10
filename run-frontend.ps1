$ErrorActionPreference = "Stop"

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

Import-DotEnv (Join-Path (Get-Location) ".env")

$port = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5191" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required for the full React/Vite frontend. Install Node.js, then run setup.ps1."
}

if (-not (Test-Path "frontend\node_modules")) {
  Write-Host "Installing frontend dependencies from internal Artifactory registry..."
  Push-Location frontend
  npm install --registry=https://artifactory.iav.com/artifactory/api/npm/npm --cache D:\GitLab\agentic_webapp_ieee\creator-agent\workspace\npm-cache-local
  Pop-Location
}

Push-Location frontend
npm run dev -- --host 127.0.0.1 --port $port
Pop-Location
