# Draws the icons in public/ from the same shapes as assets/icon.svg (Windows,
# System.Drawing): 72 px for the server, 192 and 512 px for a home screen.
# Run from the repository: powershell -File scripts/render-icons.ps1
Add-Type -AssemblyName System.Drawing

function Get-Brush($hex) { New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex)) }

function Save-Icon($size) {
  $s = $size / 72 * 4
  $n = $size * 4
  $bmp = New-Object System.Drawing.Bitmap $n, $n
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)

  $round = {
    param($x, $y, $w, $h, $r, $hex)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x *= $s; $y *= $s; $w *= $s; $h *= $s; $d = 2 * $r * $s
    $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    $g.FillPath((Get-Brush $hex), $p)
  }
  $tri = {
    param($pts, $hex)
    $a = [System.Drawing.PointF[]]@($pts | ForEach-Object { New-Object System.Drawing.PointF ($_[0] * $s), ($_[1] * $s) })
    $g.FillPolygon((Get-Brush $hex), $a)
  }

  & $round 2 2 68 68 12 '#1e2226'
  & $round 9 10 54 21 4 '#2e9e3c'
  & $round 31 18 25 5 2 '#ffffff'
  foreach ($x in 9, 23.2, 37.3, 51.5) { & $round $x 37 11.5 10 2 '#3a4046' }
  & $tri @(@(12.5, 42), @(16.5, 39.2), @(16.5, 44.8)) '#ff5a52'
  & $tri @(@(26.7, 42), @(30.7, 39.2), @(30.7, 44.8)) '#ff5a52'
  & $tri @(@(45.3, 42), @(41.3, 39.2), @(41.3, 44.8)) '#4cd964'
  & $tri @(@(59.5, 42), @(55.5, 39.2), @(55.5, 44.8)) '#4cd964'
  & $round 9 51 11.5 10 2 '#d32f2f'
  foreach ($x in 23.2, 37.3, 51.5) { & $round $x 51 11.5 10 2 '#565d64' }
  $font = New-Object System.Drawing.Font 'Arial', (16 * $s), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString('A', $font, [System.Drawing.Brushes]::White, (16 * $s), ((26.5 - 16 * 0.905) * $s), [System.Drawing.StringFormat]::GenericTypographic)

  $out = New-Object System.Drawing.Bitmap $size, $size
  $g2 = [System.Drawing.Graphics]::FromImage($out)
  $g2.InterpolationMode = 'HighQualityBicubic'
  $g2.PixelOffsetMode = 'HighQuality'
  $g2.DrawImage($bmp, 0, 0, $size, $size)
  $out.Save((Join-Path (Get-Location) "public/icon-${size}x${size}.png"), [System.Drawing.Imaging.ImageFormat]::Png)
}

foreach ($size in 72, 192, 512) { Save-Icon $size }
