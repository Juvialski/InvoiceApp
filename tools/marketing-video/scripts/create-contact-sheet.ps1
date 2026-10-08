[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = (Resolve-Path (Join-Path $workspaceRoot "..\..")).Path
$artifactRoot = Join-Path $repositoryRoot "artifacts\marketing-video\mkt-v3a"
$videoPath = Join-Path $artifactRoot "hydroqualisense-mkt-v3a-preview.mp4"
$frameDirectory = Join-Path $artifactRoot "contact-sheet-frames"
$sheetPath = Join-Path $artifactRoot "hydroqualisense-mkt-v3a-contact-sheet.png"
$ffmpegPath = Join-Path $workspaceRoot "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"

if (-not (Test-Path -LiteralPath $videoPath -PathType Leaf)) {
  throw "Rendered MKT-V3A MP4 not found: $videoPath"
}
if (-not (Test-Path -LiteralPath $ffmpegPath -PathType Leaf)) {
  throw "Bundled Remotion ffmpeg not found. Run npm.cmd install in tools/marketing-video first."
}

$framePlan = @(
  [pscustomobject]@{ Frame = 15; Label = "Opening" },
  [pscustomobject]@{ Frame = 165; Label = "Project portfolio" },
  [pscustomobject]@{ Frame = 315; Label = "Project controls" },
  [pscustomobject]@{ Frame = 465; Label = "Operations Workbook" },
  [pscustomobject]@{ Frame = 615; Label = "Supplier invoice review" },
  [pscustomobject]@{ Frame = 825; Label = "RFQs" },
  [pscustomobject]@{ Frame = 945; Label = "Purchase orders" },
  [pscustomobject]@{ Frame = 1095; Label = "Finance and operations" },
  [pscustomobject]@{ Frame = 1275; Label = "Engineering records" },
  [pscustomobject]@{ Frame = 1455; Label = "Desktop and mobile" },
  [pscustomobject]@{ Frame = 1605; Label = "Closing workspace" },
  [pscustomobject]@{ Frame = 1695; Label = "End card" }
)

New-Item -ItemType Directory -Path $frameDirectory -Force | Out-Null
$invariantCulture = [Globalization.CultureInfo]::InvariantCulture
foreach ($sample in $framePlan) {
  $seconds = ([double]$sample.Frame / 30).ToString("0.000", $invariantCulture)
  $framePath = Join-Path $frameDirectory ("frame-{0:D4}.png" -f $sample.Frame)
  & $ffmpegPath -hide_banner -loglevel error -y -ss $seconds -i $videoPath -frames:v 1 $framePath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $framePath -PathType Leaf)) {
    throw "Could not extract MKT-V3A review frame $($sample.Frame)."
  }
}

Add-Type -AssemblyName System.Drawing
$columns = 3
$rows = [Math]::Ceiling($framePlan.Count / $columns)
$cellWidth = 320
$cellHeight = 569
$labelHeight = 30
$gutter = 14
$sheetWidth = ($columns * $cellWidth) + (($columns + 1) * $gutter)
$sheetHeight = ($rows * ($cellHeight + $labelHeight)) + (($rows + 1) * $gutter)
$bitmap = [System.Drawing.Bitmap]::new($sheetWidth, $sheetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$background = [System.Drawing.Color]::FromArgb(15, 23, 42)
$labelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(226, 232, 240))
$font = [System.Drawing.Font]::new("Segoe UI", 12, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

try {
  $graphics.Clear($background)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  for ($index = 0; $index -lt $framePlan.Count; $index += 1) {
    $sample = $framePlan[$index]
    $row = [Math]::Floor($index / $columns)
    $column = $index % $columns
    $x = $gutter + ($column * ($cellWidth + $gutter))
    $y = $gutter + ($row * ($cellHeight + $labelHeight + $gutter))
    $framePath = Join-Path $frameDirectory ("frame-{0:D4}.png" -f $sample.Frame)
    $source = [System.Drawing.Image]::FromFile($framePath)
    try {
      $destination = [System.Drawing.Rectangle]::new($x, $y, $cellWidth, $cellHeight)
      $graphics.DrawImage($source, $destination)
    } finally {
      $source.Dispose()
    }
    $timeLabel = ([double]$sample.Frame / 30).ToString("0.0", $invariantCulture)
    $text = "$timeLabel s | $($sample.Label)"
    $graphics.DrawString($text, $font, $labelBrush, [System.Drawing.PointF]::new($x, $y + $cellHeight + 5))
  }

  $bitmap.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $font.Dispose()
  $labelBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output "Contact sheet: $sheetPath"
Write-Output "Source frames: $frameDirectory"
