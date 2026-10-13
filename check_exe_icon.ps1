param([Parameter(Mandatory=$true)][string]$ExePath)
$ErrorActionPreference = 'Stop'
$fullPath = (Resolve-Path $ExePath).Path
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($fullPath)
if ($null -eq $icon) { throw 'No embedded icon found in the EXE.' }
$img = $icon.ToBitmap()
$out = Join-Path (Split-Path $fullPath) 'EXEactualIcon.png'
$img.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose();$icon.Dispose()
Write-Host "Actual icon extracted from EXE: $out"
Write-Host 'Open the PNG and check that it is your supplied chibi image, not Python/Electron.'
