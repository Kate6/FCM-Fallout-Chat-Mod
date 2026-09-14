[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$CommitSha,

  [string]$CutoverRoot = 'C:\FCM\cutover\dev'
)

$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $CutoverRoot 'docker-compose.yml'
$envFile = Join-Path $CutoverRoot '.env'
$activeMarker = Join-Path $CutoverRoot 'CUTOVER_ACTIVE'
$checkpointFile = Join-Path $CutoverRoot 'checkpoints\auto-deploy.json'
$newImage = "fcm-cutover-dev-backend:$CommitSha"

if (-not (Test-Path -LiteralPath $activeMarker -PathType Leaf)) {
  Write-Host 'Laptop Dev auto-deploy skipped: CUTOVER_ACTIVE is absent.'
  exit 0
}
if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) {
  throw "Missing cutover Compose file: $composeFile"
}
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Missing cutover environment file: $envFile"
}

$composeProjects = @(docker compose ls --format json | ConvertFrom-Json)
$unexpected = @($composeProjects | Where-Object { $_.Name -ne 'fcm-cutover-dev' })
if ($unexpected.Count -gt 0) {
  throw "Unexpected Compose project(s) are active: $($unexpected.Name -join ', ')"
}

$envLines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $envFile)
$imageLine = $envLines | Where-Object { $_ -match '^FCM_BACKEND_IMAGE=' } | Select-Object -First 1
if (-not $imageLine) { throw 'FCM_BACKEND_IMAGE is missing from the laptop Dev .env file.' }
$previousImage = $imageLine.Substring('FCM_BACKEND_IMAGE='.Length)
if (-not $previousImage) { throw 'FCM_BACKEND_IMAGE is empty.' }

$checkpointDir = Split-Path -Parent $checkpointFile
New-Item -ItemType Directory -Path $checkpointDir -Force | Out-Null
$checkpoint = [ordered]@{
  status = 'building'
  commitSha = $CommitSha
  previousImage = $previousImage
  candidateImage = $newImage
  startedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$checkpoint | ConvertTo-Json | Set-Content -LiteralPath $checkpointFile -Encoding utf8

docker build --pull=false --build-arg VITE_DEV_PERSONAS=true --file backend/Dockerfile --tag $newImage .
if ($LASTEXITCODE -ne 0) { throw 'Laptop Dev image build failed.' }

for ($i = 0; $i -lt $envLines.Count; $i++) {
  if ($envLines[$i] -match '^FCM_BACKEND_IMAGE=') {
    $envLines[$i] = "FCM_BACKEND_IMAGE=$newImage"
  }
}
$envLines | Set-Content -LiteralPath $envFile -Encoding utf8

try {
  Push-Location $CutoverRoot
  docker compose --profile edge config --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Laptop Dev Compose validation failed.' }
  docker compose --profile edge up -d --no-deps backend
  if ($LASTEXITCODE -ne 0) { throw 'Laptop Dev backend deployment failed.' }

  $healthy = $false
  for ($attempt = 1; $attempt -le 24; $attempt++) {
    Start-Sleep -Seconds 5
    try {
      $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:17676/api/health'
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
  }
  if (-not $healthy) { throw 'Laptop Dev failed its localhost health check.' }

  $checkpoint.status = 'healthy'
  $checkpoint.completedAt = (Get-Date).ToUniversalTime().ToString('o')
  $checkpoint | ConvertTo-Json | Set-Content -LiteralPath $checkpointFile -Encoding utf8
  Write-Host "Laptop Dev deployed commit $CommitSha and passed health validation."
} catch {
  Write-Warning 'Laptop Dev candidate failed; capturing backend diagnostics before rollback.'
  try {
    docker compose --profile edge ps backend
    docker compose --profile edge logs --no-color --tail 200 backend
  } catch {
    Write-Warning "Unable to capture candidate backend diagnostics: $($_.Exception.Message)"
  }
  for ($i = 0; $i -lt $envLines.Count; $i++) {
    if ($envLines[$i] -match '^FCM_BACKEND_IMAGE=') {
      $envLines[$i] = "FCM_BACKEND_IMAGE=$previousImage"
    }
  }
  $envLines | Set-Content -LiteralPath $envFile -Encoding utf8
  docker compose --profile edge up -d --no-deps backend
  $checkpoint.status = 'rolled-back'
  $checkpoint.error = $_.Exception.Message
  $checkpoint.completedAt = (Get-Date).ToUniversalTime().ToString('o')
  $checkpoint | ConvertTo-Json | Set-Content -LiteralPath $checkpointFile -Encoding utf8
  throw
} finally {
  Pop-Location
}
