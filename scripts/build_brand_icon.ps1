$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$project=Split-Path -Parent $PSScriptRoot
$source=[Drawing.Image]::FromFile((Join-Path $project 'assets/brand-source.jpg'))
try {
 $source.Save((Join-Path $project 'assets/avatar.png'),[Drawing.Imaging.ImageFormat]::Png)
 $sizes=@(16,24,32,48,64,128,256);$frames=@()
 foreach($size in $sizes){
  $bitmap=New-Object Drawing.Bitmap($size,$size)
  $graphics=[Drawing.Graphics]::FromImage($bitmap)
  try{$graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$graphics.DrawImage($source,0,0,$size,$size)}finally{$graphics.Dispose()}
  $stream=New-Object IO.MemoryStream
  try{$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png);$frames+=,@{size=$size;bytes=$stream.ToArray()}}finally{$stream.Dispose();$bitmap.Dispose()}
 }
 $output=[IO.File]::Create((Join-Path $project 'assets/app.ico'));$writer=New-Object IO.BinaryWriter($output)
 try {
  $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$frames.Count)
  $offset=6+16*$frames.Count
  foreach($frame in $frames){$s=$frame.size;if($s -eq 256){$s=0};$writer.Write([byte]$s);$writer.Write([byte]$s);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$frame.bytes.Length);$writer.Write([uint32]$offset);$offset+=$frame.bytes.Length}
  foreach($frame in $frames){$writer.Write([byte[]]$frame.bytes)}
 }finally{$writer.Dispose();$output.Dispose()}
}finally{$source.Dispose()}
Write-Output 'Generated exact-source application PNG and multi-size Windows ICO.'
