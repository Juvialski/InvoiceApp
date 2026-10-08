[CmdletBinding()]
param([ValidateSet('portrait','landscape')][string]$Layout = 'portrait')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = (Resolve-Path (Join-Path $workspaceRoot '..\..')).Path
$artifactRoot = Join-Path $repositoryRoot 'artifacts\marketing-video\mkt-v3a'
$videoPath = Join-Path $artifactRoot "hydroqualisense-mkt-v3a-$Layout-final.mp4"
$frameDirectory = Join-Path $artifactRoot "$Layout-inspection-frames"
$ffmpegPath = Join-Path $workspaceRoot 'node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe'
$ffprobePath = Join-Path $workspaceRoot 'node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe'
$plan = Get-Content -LiteralPath (Join-Path $artifactRoot 'inspection-plan.json') -Raw | ConvertFrom-Json
$probeText = & $ffprobePath -v error -count_frames -show_streams -show_format -of json $videoPath
if ($LASTEXITCODE -ne 0) { throw 'ffprobe failed' }
$probe = $probeText | ConvertFrom-Json
$stream = $probe.streams | Where-Object codec_type -EQ 'video' | Select-Object -First 1
$expectedWidth = if ($Layout -eq 'portrait') { 1080 } else { 1920 }
$expectedHeight = if ($Layout -eq 'portrait') { 1920 } else { 1080 }
if ($stream.codec_name -ne 'h264' -or $stream.width -ne $expectedWidth -or $stream.height -ne $expectedHeight -or $stream.r_frame_rate -ne '30/1' -or [int]$stream.nb_read_frames -ne $plan.durationFrames) { throw 'Master format or frame count does not match the composition' }
# This FFmpeg build omits wrapped_avframe, the null muxer's default encoder.
# Decode every source frame and encode a small disposable stream to null.
& $ffmpegPath -hide_banner -v error -i $videoPath -an -vf scale=320:-2 -c:v libx264 -preset ultrafast -threads 2 -f null -
if ($LASTEXITCODE -ne 0) { throw 'Video decode verification failed' }
@{ layout = $Layout; decodeVerified = $true; probe = $probe } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $artifactRoot "$Layout-media-validation.json") -Encoding utf8
New-Item -ItemType Directory -Path $frameDirectory -Force | Out-Null
foreach ($sample in $plan.frames) {
  $seconds = ([double]$sample.frame / 30).ToString('0.000000',[Globalization.CultureInfo]::InvariantCulture)
  $framePath = Join-Path $frameDirectory ('frame-{0:D4}.png' -f $sample.frame)
  & $ffmpegPath -hide_banner -loglevel error -y -ss $seconds -i $videoPath -frames:v 1 $framePath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $framePath)) { throw "Frame extraction failed: $($sample.frame)" }
  if ($sample.kind -eq 'opening' -or $sample.kind -eq 'closing') { Copy-Item -LiteralPath $framePath -Destination (Join-Path $artifactRoot "$Layout-$($sample.kind)-frame.png") -Force }
}
Add-Type -AssemblyName System.Drawing
function Write-ContactSheet($Samples, [string]$Destination) {
  $columns = if ($Layout -eq 'portrait') { 4 } else { 3 }
  $cellWidth = if ($Layout -eq 'portrait') { 270 } else { 480 }
  $cellHeight = if ($Layout -eq 'portrait') { 480 } else { 270 }
  $labelHeight = 32
  $gutter = 12
  $rows = [Math]::Ceiling($Samples.Count / $columns)
  $bitmap = [System.Drawing.Bitmap]::new(($columns*$cellWidth)+(($columns+1)*$gutter), ($rows*($cellHeight+$labelHeight))+(($rows+1)*$gutter))
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(226,232,240))
  $font = [System.Drawing.Font]::new('Segoe UI',11,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(15,23,42))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    for ($index = 0; $index -lt $Samples.Count; $index++) {
      $sample = $Samples[$index]
      $x = $gutter + (($index % $columns)*($cellWidth+$gutter))
      $y = $gutter + ([Math]::Floor($index/$columns)*($cellHeight+$labelHeight+$gutter))
      $source = [System.Drawing.Image]::FromFile((Join-Path $frameDirectory ('frame-{0:D4}.png' -f $sample.frame)))
      try { $graphics.DrawImage($source,[System.Drawing.Rectangle]::new($x,$y,$cellWidth,$cellHeight)) } finally { $source.Dispose() }
      $graphics.DrawString("$($sample.frame) | $($sample.label)",$font,$brush,[System.Drawing.RectangleF]::new($x,$y+$cellHeight+3,$cellWidth,$labelHeight))
    }
    $bitmap.Save($Destination,[System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $font.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
Write-ContactSheet @($plan.frames | Where-Object kind -NE 'transition') (Join-Path $artifactRoot "$Layout-contact-sheet.png")
Write-ContactSheet @($plan.frames | Where-Object kind -EQ 'transition') (Join-Path $artifactRoot "$Layout-transition-contact-sheet.png")
Write-Output "${Layout}: H.264 $expectedWidth x $expectedHeight, 30 FPS, $($plan.durationFrames) decoded frames; $($plan.frames.Count) inspection frames."
