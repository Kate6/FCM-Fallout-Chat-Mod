$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'FCM.HudCapture.psm1') -Force
$folder = Join-Path ([IO.Path]::GetTempPath()) ('fcm-hud-capture-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $folder | Out-Null
try {
    $line = 'token=abc userId=123456789012345678 body="hello" wss://falloutchatmod.com/relay'
    $clean = ConvertTo-FcmSanitizedLogLine $line
    if ($clean -match 'abc|123456789012345678|falloutchatmod.com') { throw 'Sensitive diagnostic data was retained.' }
    $path = Join-Path $folder 'sample.log'
    [IO.File]::WriteAllText($path, "old`n", [Text.UTF8Encoding]::new($false))
    $offset = (Get-Item $path).Length
    [IO.File]::AppendAllText($path, "Input.RegisterKey key=45 result=accepted`n", [Text.UTF8Encoding]::new($false))
    $batch = Read-FcmNewLogLines -Path $path -Offset $offset
    if ($batch.Lines.Count -ne 1 -or $batch.Lines[0] -notmatch 'key=45') { throw 'Incremental log capture failed.' }
    $fingerprint = Get-FcmFileFingerprint $path
    if ($fingerprint.sizeBytes -ne (Get-Item $path).Length -or $fingerprint.sha256.Length -ne 64) { throw 'Fingerprint failed.' }
    Write-Host 'native HUD capture tests passed'
} finally {
    Remove-Item -LiteralPath $folder -Recurse -Force
}
