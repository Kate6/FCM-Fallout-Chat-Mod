[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$GameDirectory,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\simulator\artifacts'),
    [ValidateRange(10, 1800)][int]$DurationSeconds = 120
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'FCM.HudCapture.psm1') -Force

$game = Get-Process -Name 'Fallout76' -ErrorAction SilentlyContinue
if ($null -eq $game) { throw 'Fallout76 is not running. Launch it yourself, reach the HUD, then run this collector.' }
if (@($game).Count -ne 1) { throw 'Expected exactly one Fallout76 process; refusing an ambiguous capture.' }

$gameRoot = (Resolve-Path -LiteralPath $GameDirectory).Path
$processPath = $game.Path
if ([IO.Path]::GetFullPath($processPath) -ne [IO.Path]::GetFullPath((Join-Path $gameRoot 'Fallout76.exe'))) {
    throw 'The running Fallout76 process does not belong to the supplied game directory.'
}

$runId = [guid]::NewGuid().ToString('N')
$runDirectory = Join-Path $OutputDirectory ('native-' + $runId)
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$xscalLog = Join-Path $gameRoot 'xscal.log'
$zfeLog = Join-Path $gameRoot 'zfe.log'
$sources = @(
    [pscustomobject]@{ Name = 'sim-xscal.log'; Path = $xscalLog; Offset = $(if (Test-Path $xscalLog) { (Get-Item $xscalLog).Length } else { 0 }) },
    [pscustomobject]@{ Name = 'sim-zfe.log'; Path = $zfeLog; Offset = $(if (Test-Path $zfeLog) { (Get-Item $zfeLog).Length } else { 0 }) }
)

$manifest = [ordered]@{
    schemaVersion = 1
    evidence = 'REAL FALLOUT SESSION; LOG CONTENT SANITIZED'
    runId = $runId
    startedAtUtc = [DateTime]::UtcNow.ToString('o')
    durationSeconds = $DurationSeconds
    process = [ordered]@{ name = 'Fallout76'; pid = $game.Id; launchedByCollector = $false }
    artifacts = [ordered]@{
        fallout = Get-FcmFileFingerprint (Join-Path $gameRoot 'Fallout76.exe')
        xscal = Get-FcmFileFingerprint (Join-Path $gameRoot 'dxgi.dll')
        widget = Get-FcmFileFingerprint (Join-Path $gameRoot 'Data\FCMChatWidget.ba2')
        hudModLoader = Get-FcmFileFingerprint (Join-Path $gameRoot 'Data\HUDModLoader.ba2')
    }
}

try {
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runDirectory 'manifest.json') -Encoding utf8NoBOM
    Write-Host "Capturing fresh HUD diagnostics for $DurationSeconds seconds. Exercise the test checklist in README.md."
    $deadline = [DateTime]::UtcNow.AddSeconds($DurationSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Get-Process -Id $game.Id -ErrorAction SilentlyContinue)) { break }
        foreach ($source in $sources) {
            $batch = Read-FcmNewLogLines -Path $source.Path -Offset $source.Offset
            $source.Offset = $batch.Offset
            if ($batch.Lines.Count -gt 0) {
                $batch.Lines | Add-Content -LiteralPath (Join-Path $runDirectory $source.Name) -Encoding utf8NoBOM
                $batch.Lines | ForEach-Object { Write-Host "[$($source.Name)] $_" }
            }
        }
        Start-Sleep -Milliseconds 250
    }
} finally {
    $manifest.endedAtUtc = [DateTime]::UtcNow.ToString('o')
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runDirectory 'manifest.json') -Encoding utf8NoBOM
    Write-Host "Capture stopped. Fallout76 was not launched, modified, or stopped. Evidence: $runDirectory"
}
