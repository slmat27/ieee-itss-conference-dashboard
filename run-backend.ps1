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

if (-not $env:UV_PYTHON) {
  $python312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
  if (Test-Path $python312) {
    $env:UV_PYTHON = $python312
  }
}

$port = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8029" }
$workspacePython = Resolve-Path "..\..\validation-venv\Scripts\python.exe" -ErrorAction SilentlyContinue
if ($workspacePython) {
  & $workspacePython.Path -m uvicorn app.main:app --host 127.0.0.1 --port $port
  exit $LASTEXITCODE
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  throw "uv is required when the workspace validation environment is not available. Run setup.ps1 after installing uv."
}

$env:UV_CACHE_DIR = Join-Path (Resolve-Path "..\..").Path "uv-cache-local"
uv run uvicorn app.main:app --host 127.0.0.1 --port $port
