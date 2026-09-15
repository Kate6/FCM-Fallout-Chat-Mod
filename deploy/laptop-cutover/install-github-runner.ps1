[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RegistrationToken,

  [string]$RepositoryUrl = 'https://github.com/UNN-Devotek/FCM-Fallout-Chat-Mod',
  [string]$InstallRoot = 'C:\FCM\github-runner',
  [string]$RunnerVersion = '2.337.0'
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this installer from an elevated PowerShell window.'
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$archive = Join-Path $env:TEMP "actions-runner-win-x64-$RunnerVersion.zip"
$url = "https://github.com/actions/runner/releases/download/v$RunnerVersion/actions-runner-win-x64-$RunnerVersion.zip"
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
Expand-Archive -LiteralPath $archive -DestinationPath $InstallRoot -Force
Remove-Item -LiteralPath $archive -Force

Push-Location $InstallRoot
try {
  & .\config.cmd --unattended --url $RepositoryUrl --token $RegistrationToken `
    --name 'msi-fcm-dev' --labels 'fcm-laptop-dev' --work '_work' --runasservice
  if ($LASTEXITCODE -ne 0) { throw 'GitHub runner registration failed.' }

  # The runner service defaults to NETWORK SERVICE. The cutover root has a
  # deliberately restrictive ACL, so grant only this service identity the
  # traversal/runtime access required for Compose and Docker Desktop.
  icacls 'C:\FCM' /grant 'NETWORK SERVICE:(RX)' | Out-Null
  icacls $InstallRoot /grant 'NETWORK SERVICE:(OI)(CI)(M)' /T /C | Out-Null
  icacls 'C:\FCM\cutover\dev' /grant 'NETWORK SERVICE:(OI)(CI)(M)' /T /C | Out-Null
  net localgroup docker-users 'NT AUTHORITY\NETWORK SERVICE' /add 2>$null | Out-Null

  & .\svc.cmd start
  if ($LASTEXITCODE -ne 0) { throw 'GitHub runner service failed to start.' }
} finally {
  Pop-Location
}

Write-Host 'GitHub Actions runner msi-fcm-dev is installed and running.'
