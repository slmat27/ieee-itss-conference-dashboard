param(
  [string]$FrontendUrl = "http://127.0.0.1:5191",
  [string]$OutputDir,
  [string]$BrowserPath = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $OutputDir) {
  $OutputDir = Join-Path $ProjectRoot "webapp-backup\screenshots"
}

$FrontendUrl = $FrontendUrl.TrimEnd("/")
$OutputPath = New-Item -ItemType Directory -Force -Path $OutputDir
Get-ChildItem -Path $OutputPath.FullName -Filter "*.png" -File -ErrorAction SilentlyContinue | Remove-Item -Force

function Resolve-BrowserPath {
  param([string]$RequestedPath)

  if ($RequestedPath -and (Test-Path $RequestedPath)) {
    return (Resolve-Path $RequestedPath).Path
  }

  $Candidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )

  foreach ($Candidate in $Candidates) {
    if (Test-Path $Candidate) {
      return $Candidate
    }
  }

  throw "Could not find Microsoft Edge or Google Chrome. Pass -BrowserPath with a Chromium-based browser path."
}

function Get-FirstConferenceId {
  try {
    $Response = Invoke-RestMethod -Uri "$FrontendUrl/api/conferences" -TimeoutSec 15
    $First = $Response.items | Select-Object -First 1
    return $First.id
  } catch {
    Write-Warning "Could not resolve a sample conference detail page: $($_.Exception.Message)"
    return $null
  }
}

function Capture-Route {
  param(
    [string]$Browser,
    [string]$Name,
    [string]$Path
  )

  $FileName = "$Name.png"
  $Target = Join-Path $OutputPath.FullName $FileName
  $Url = "$FrontendUrl$Path"
  $ProfileDir = Join-Path ([System.IO.Path]::GetTempPath()) ("itss-screenshot-profile-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

  try {
    $Args = @(
      "--headless=new",
      "--disable-gpu",
      "--disable-crash-reporter",
      "--disable-crashpad",
      "--disable-features=Crashpad",
      "--disable-extensions",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-sandbox",
      "--no-first-run",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=6000",
      "--window-size=1440,1400",
      "--user-data-dir=$ProfileDir",
      "--screenshot=$Target",
      $Url
    )

    & $Browser @Args | Out-Null
    if (-not (Test-Path $Target)) {
      throw "Screenshot was not written."
    }
    Write-Host "Captured $FileName"
  } finally {
    Remove-Item -LiteralPath $ProfileDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$Browser = Resolve-BrowserPath -RequestedPath $BrowserPath
$Routes = @(
  @{ Name = "01-overview"; Path = "/" },
  @{ Name = "02-conferences"; Path = "/conferences" },
  @{ Name = "03-issues"; Path = "/issues" },
  @{ Name = "04-import-center"; Path = "/imports" },
  @{ Name = "05-knowledge-base"; Path = "/documents" },
  @{ Name = "06-assistant"; Path = "/assistant" },
  @{ Name = "07-templates"; Path = "/templates" },
  @{ Name = "08-email-drafts"; Path = "/email-drafts" },
  @{ Name = "09-settings"; Path = "/settings" },
  @{ Name = "10-system-status"; Path = "/status" }
)

$ConferenceId = Get-FirstConferenceId
if ($ConferenceId) {
  $Routes += @{ Name = "11-conference-detail"; Path = "/conferences/$ConferenceId" }
}

foreach ($Route in $Routes) {
  Capture-Route -Browser $Browser -Name $Route.Name -Path $Route.Path
}

Write-Host "Screenshots saved to $($OutputPath.FullName)"
