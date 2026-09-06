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

function Test-Url {
  param([string]$Url)
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $Url | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

function Wait-ForUrl {
  param(
    [string]$Url,
    [string]$Name,
    [int]$TimeoutSeconds = 45
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $Url | Out-Null
      Write-Host "$Name is ready: $Url"
      return
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }
  throw "$Name did not answer within $TimeoutSeconds seconds. Check its visible service window."
}

$envPath = Join-Path $ProjectRoot ".env"
Import-DotEnv $envPath
if (-not $env:APP_ENV) { $env:APP_ENV = "local" }
if (-not $env:HOST) { $env:HOST = "127.0.0.1" }
$backendPort = if ($env:PORT) { $env:PORT } elseif ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8029" }
$frontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5191" }
$env:PORT = $backendPort
$env:BACKEND_PORT = $backendPort
$backendUrl = "http://127.0.0.1:$backendPort"
$frontendUrl = "http://127.0.0.1:$frontendPort"

Write-Host "Starting IEEE ITSS backend and frontend in separate visible PowerShell windows..."
Write-Host "If a service fails, its window will stay open with the error message."
if (Test-Url "$backendUrl/healthz") {
  Write-Host "Backend is already running."
}
else {
  Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "run-backend.ps1")
}
Start-Sleep -Seconds 2
if (Test-Url "$frontendUrl/") {
  Write-Host "Frontend is already running."
}
else {
  Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "run-frontend.ps1")
}

Wait-ForUrl "$backendUrl/healthz" "Backend"
Wait-ForUrl "$frontendUrl/" "Frontend"

Write-Host ""
Write-Host "Backend:  $backendUrl"
Write-Host "Frontend: $frontendUrl"
Write-Host "Opening the dashboard..."
Start-Process $frontendUrl
