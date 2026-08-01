$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { Write-Host "csc not found"; exit 1 }
$src = Join-Path $PSScriptRoot "helper\WallpaperEmbed.cs"
$out = Join-Path $PSScriptRoot "helper\WallpaperEmbed.exe"
& $csc /nologo /target:exe /out:$out $src
Write-Host "helper built: $out"