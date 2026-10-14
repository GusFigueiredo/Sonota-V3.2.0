param([string]$InstallRoot='')
$ErrorActionPreference='Continue'
if([string]::IsNullOrWhiteSpace($InstallRoot)){$InstallRoot=Join-Path $env:LOCALAPPDATA 'Programs\Sonota'}
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$Runtime=Join-Path $InstallRoot 'runtime'
$Python=Join-Path $Runtime 'python310\python.exe'
$Worker=Join-Path $InstallRoot 'app\audio\worker.py'
$Ffmpeg=Join-Path $Runtime 'ffmpeg\ffmpeg.exe'

$checks=[ordered]@{}
$checks.SonotaExe=Test-Path (Join-Path $InstallRoot 'Sonota.exe')
$checks.Node=Test-Path (Join-Path $Runtime 'node.exe')
$checks.FFmpeg=Test-Path $Ffmpeg
$checks.AudioPython=Test-Path $Python

if($checks.AudioPython -and (Test-Path $Worker)){
  $old=$env:Path;$env:Path=(Join-Path $Runtime 'ffmpeg')+';'+$env:Path
  $stderr=[IO.Path]::GetTempFileName()
  $out=@(& $Python $Worker --capabilities 2>$stderr)
  $code=$LASTEXITCODE
  $env:Path=$old
  $json=($out|ForEach-Object{[string]$_}|Where-Object{$_.Trim().StartsWith('{')}|Select-Object -Last 1)
  try{$checks.AudioCapabilities=if($json){$json|ConvertFrom-Json}else{$null}}catch{$checks.AudioCapabilities=$null}
  $checks.AudioWorkerExitCode=$code
  Remove-Item $stderr -Force -ErrorAction SilentlyContinue
}else{$checks.AudioCapabilities=$null}

try{
  $tags=Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
  $models=@($tags.models|ForEach-Object{$_.name})
  $checks.Ollama=$true
  $checks.QwenFast=$models -contains 'qwen3:1.7b'
  $checks.QwenAgent=$models -contains 'qwen3:1.7b'
  $checks.QwenEmbedding=$models -contains 'qwen3-embedding:0.6b'
}catch{
  $checks.Ollama=$false;$checks.QwenFast=$false;$checks.QwenAgent=$false;$checks.QwenEmbedding=$false
}

$audioOk=$checks.AudioCapabilities -and $checks.AudioCapabilities.stems -and $checks.AudioCapabilities.midi -and $checks.AudioCapabilities.partitura
$ok=$checks.SonotaExe -and $checks.Node -and $checks.FFmpeg -and $checks.AudioPython -and $audioOk -and $checks.Ollama -and $checks.QwenFast -and $checks.QwenAgent -and $checks.QwenEmbedding
[ordered]@{ok=[bool]$ok;installRoot=$InstallRoot;checks=$checks;checkedAt=(Get-Date).ToString('o')}|ConvertTo-Json -Depth 10
if($ok){exit 0}else{exit 1}
