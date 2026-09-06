$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $ProjectRoot

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required tool '$Name' was not found on PATH."
  }
}

Require-Command uv
Require-Command npm

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Fill Azure OpenAI values before using AI features."
}

New-Item -ItemType Directory -Force -Path "data", "data\imports", "data\documents", "data\exports", "data\vector_store", "storage", ".uv-cache", ".npm-cache" | Out-Null

$env:UV_CACHE_DIR = Join-Path $ProjectRoot ".uv-cache"
uv sync
if ($LASTEXITCODE -ne 0) { throw "uv sync failed." }

Push-Location frontend
try {
  npm ci --cache (Join-Path $ProjectRoot ".npm-cache")
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
}
finally {
  Pop-Location
}

Write-Host "Setup complete. Use .\scripts\local\run-all.bat or .\scripts\local\run-all.ps1 to start the local app."
