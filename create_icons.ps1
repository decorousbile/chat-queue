Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\lan\.gemini\antigravity\brain\c43573e5-37b1-473c-9448-6d84979e3344\extension_icon_1778523149666.png"
$iconDir = "d:\desjk\chat queue\icons"

New-Item -Path $iconDir -ItemType Directory -Force | Out-Null

$src = [System.Drawing.Image]::FromFile($srcPath)

$sizes = @(16, 48, 128)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    $outPath = Join-Path $iconDir ("icon" + $size + ".png")
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created icon${size}.png"
}

$src.Dispose()
Write-Host "All icons created!"
