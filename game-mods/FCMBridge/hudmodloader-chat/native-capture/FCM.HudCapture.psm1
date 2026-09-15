Set-StrictMode -Version Latest

function ConvertTo-FcmSanitizedLogLine {
    [CmdletBinding()]
    param([AllowEmptyString()][string]$Line)

    $value = $Line
    $value = [regex]::Replace($value, '(?i)(authorization|token|secret|password)(\s*[:=]\s*)([^\s,;]+)', '$1$2<redacted>')
    $value = [regex]::Replace($value, '(?i)wss?://[^/\s]+', 'wss://<redacted-host>')
    $value = [regex]::Replace($value, '(?i)https?://[^/\s]+', 'https://<redacted-host>')
    $value = [regex]::Replace($value, '(?i)"(body|content|displayName|username|userId|linkedUserId)"\s*:\s*"(?:\\.|[^"])*"', '"$1":"<redacted>"')
    $value = [regex]::Replace($value, '(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b', '<redacted-uuid>')
    $value = [regex]::Replace($value, '\b\d{15,22}\b', '<redacted-id>')
    return $value
}

function Get-FcmFileFingerprint {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $item = Get-Item -LiteralPath $Path
    return [ordered]@{
        name = $item.Name
        sizeBytes = $item.Length
        sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function Read-FcmNewLogLines {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][long]$Offset
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [pscustomobject]@{ Offset = $Offset; Lines = @() }
    }
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
        if ($Offset -gt $stream.Length) { $Offset = 0 }
        [void]$stream.Seek($Offset, [IO.SeekOrigin]::Begin)
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true, 4096, $true)
        try {
            $lines = [Collections.Generic.List[string]]::new()
            while (-not $reader.EndOfStream) { $lines.Add((ConvertTo-FcmSanitizedLogLine $reader.ReadLine())) }
            $nextOffset = $stream.Position
        } finally { $reader.Dispose() }
        return [pscustomobject]@{ Offset = $nextOffset; Lines = @($lines) }
    } finally { $stream.Dispose() }
}

Export-ModuleMember -Function ConvertTo-FcmSanitizedLogLine, Get-FcmFileFingerprint, Read-FcmNewLogLines
