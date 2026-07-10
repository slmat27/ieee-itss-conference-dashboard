$ErrorActionPreference = "Stop"

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

New-Item -ItemType Directory -Force -Path "data", "data\imports", "data\documents", "data\exports", "data\vector_store", "storage" | Out-Null

$env:UV_CACHE_DIR = Join-Path (Get-Location) ".uv-cache"
if (-not $env:UV_PYTHON) {
  $python312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
  if (Test-Path $python312) {
    $env:UV_PYTHON = $python312
  }
}

uv sync
Push-Location frontend
npm install --registry=https://artifactory.iav.com/artifactory/api/npm/npm --cache D:\GitLab\agentic_webapp_ieee\creator-agent\workspace\npm-cache-local
Pop-Location

Write-Host "Setup complete. Use .\run-all.bat or .\run-all.ps1 to start the local app."
