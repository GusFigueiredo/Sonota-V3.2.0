param(
  [switch]$SkipAngularInstall,
  [switch]$SkipBackendInstall,
  [switch]$SkipDesktopInstall,
  [switch]$SkipInstaller,
  [switch]$KeepRustTarget
)

$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

$InstallerDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$Root=(Resolve-Path (Join-Path $InstallerDir '..\..')).Path
$Desktop=Join-Path $Root 'desktop'
$Staging=Join-Path $InstallerDir 'staging'
$Temp=Join-Path $InstallerDir '.build-temp'
$Cache=Join-Path $InstallerDir '.build-cache'
$CargoTarget=if($env:SONOTA_CARGO_TARGET){$env:SONOTA_CARGO_TARGET}else{Join-Path $Temp 'cargo-target'}

function Step([string]$Text){Write-Host "`n=== $Text ===" -ForegroundColor Cyan}
function Require([string]$Command,[string]$Message){if(-not(Get-Command $Command -ErrorAction SilentlyContinue)){throw $Message}}
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Test-ZipValid([string]$Path){
  if(-not(Test-Path -LiteralPath $Path)){return $false}
  try{
    $zip=[System.IO.Compression.ZipFile]::OpenRead($Path)
    try{$null=$zip.Entries.Count;return $true}finally{$zip.Dispose()}
  }catch{return $false}
}
function Download([string]$Uri,[string]$Path){
  $isZip=([IO.Path]::GetExtension($Path) -ieq '.zip')
  if(Test-Path -LiteralPath $Path){
    if($isZip -and -not(Test-ZipValid $Path)){
      Write-Warning "Cache ZIP corrompido detectado: $([IO.Path]::GetFileName($Path)). Removendo e baixando novamente."
      Remove-Item -LiteralPath $Path -Force
    }else{
      Write-Host "Cache: $([IO.Path]::GetFileName($Path))"
      return
    }
  }
  for($attempt=1;$attempt -le 2;$attempt++){
    Write-Host "Baixando $Uri (tentativa $attempt/2)"
    try{
      Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Path
      if(-not $isZip -or (Test-ZipValid $Path)){return}
      Write-Warning "O arquivo baixado não é um ZIP íntegro: $([IO.Path]::GetFileName($Path))."
    }catch{
      Write-Warning "Falha no download: $($_.Exception.Message)"
    }
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if($attempt -eq 2){throw "Não foi possível obter um arquivo válido: $Uri"}
    Start-Sleep -Seconds 2
  }
}
function Ensure-Hash([string]$Uri,[string]$Path,[string]$ExpectedHash,[string]$Label){
  $actual=(Get-FileHash -Algorithm SHA256 $Path).Hash.ToLowerInvariant()
  if($actual -eq $ExpectedHash.ToLowerInvariant()){return}
  Write-Warning "SHA-256 inválido para $Label. Limpando cache e baixando novamente."
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  Download $Uri $Path
  $actual=(Get-FileHash -Algorithm SHA256 $Path).Hash.ToLowerInvariant()
  if($actual -ne $ExpectedHash.ToLowerInvariant()){throw "SHA-256 do $Label não confere após novo download."}
}
function Verify-Signature([string]$Path,[string]$SubjectRegex){
  $sig=Get-AuthenticodeSignature -FilePath $Path
  if($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch $SubjectRegex){throw "Assinatura digital inválida: $Path"}
}
function Free-GB([string]$Path){
  $full=[IO.Path]::GetFullPath($Path)
  $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))
  return [math]::Round($drive.AvailableFreeSpace/1GB,1)
}
function Assert-BuildSpace([double]$MinimumGB=8){
  $free=Free-GB $Root
  Write-Host "Espaço livre no disco do projeto: $free GB"
  if($free -lt $MinimumGB){
    throw "Espaço insuficiente para compilar o Tauri e gerar o instalador. Há $free GB livres. Libere pelo menos $MinimumGB GB (recomendado: 12 GB) e execute novamente. O erro 112 do Rust significa disco cheio."
  }
}
function Remove-ProductionJunk([string]$AppStage){
  # V3.2.0: npm publica muitos arquivos úteis apenas para desenvolvimento. Eles não são
  # necessários em runtime e aumentam o Setup porque existem em dezenas de pacotes.
  $modules=Join-Path $AppStage 'node_modules'
  if(Test-Path $modules){
    $junkDirs=@('.github','test','tests','bench','benchmark','benchmarks','example','examples','coverage','docs','doc')
    Get-ChildItem -LiteralPath $modules -Directory -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $junkDirs -contains $_.Name.ToLowerInvariant() } |
      Sort-Object { $_.FullName.Length } -Descending |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath $modules -File -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^(README|CHANGELOG|HISTORY)(\..*)?$' -or $_.Extension -eq '.map' } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }
  $audio=Join-Path $AppStage 'audio'
  if(Test-Path $audio){
    Get-ChildItem -LiteralPath $audio -Directory -Recurse -Force -Filter '__pycache__' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath $audio -File -Recurse -Force -Filter '*.pyc' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  }
  Remove-Item (Join-Path $AppStage 'package-lock.json') -Force -ErrorAction SilentlyContinue
}

Require 'node' 'Node.js 24 é necessário somente na máquina de desenvolvimento.'
Require 'npm' 'npm não foi encontrado.'
Require 'cargo' 'Rust/Cargo não foi encontrado. Instale via rustup para gerar o executável Tauri.'
$major=& node -p "process.versions.node.split('.')[0]"
if($major -ne '24'){throw "Use Node.js 24 para gerar a release. Encontrado: $(& node --version)"}

# Limpa restos de builds interrompidos antes de medir espaço. Isso evita o erro
# "os error 112 / no space on device" causado por artefatos Rust incompletos.
$legacyTarget=Join-Path $Desktop 'src-tauri\target'
if(Test-Path $legacyTarget){
  Write-Host 'Removendo cache Rust antigo do projeto para reduzir uso de disco...'
  Remove-Item $legacyTarget -Recurse -Force
}
if(Test-Path $Temp){Remove-Item $Temp -Recurse -Force}
New-Item -ItemType Directory -Path $Temp -Force | Out-Null
New-Item -ItemType Directory -Path $Cache -Force | Out-Null
Assert-BuildSpace 8

Step '1/8 - Compilando Ionic Angular'
if(-not $SkipAngularInstall){
  if(Test-Path (Join-Path $Root 'mobile\package-lock.json')){npm --prefix (Join-Path $Root 'mobile') ci}else{npm --prefix (Join-Path $Root 'mobile') install}
  if($LASTEXITCODE -ne 0){throw 'Falha ao instalar dependências Angular.'}
}
npm --prefix (Join-Path $Root 'mobile') run build
if($LASTEXITCODE -ne 0){throw 'Falha no build Angular.'}

Step '2/8 - Preparando backend Node de produção'
if(Test-Path $Staging){Remove-Item $Staging -Recurse -Force}
New-Item -ItemType Directory -Path $Staging | Out-Null
$appStage=Join-Path $Staging 'app'
New-Item -ItemType Directory -Path $appStage | Out-Null
Copy-Item (Join-Path $Root 'src') (Join-Path $appStage 'src') -Recurse
Copy-Item (Join-Path $Root 'public') (Join-Path $appStage 'public') -Recurse
Copy-Item (Join-Path $Root 'audio') (Join-Path $appStage 'audio') -Recurse
Copy-Item (Join-Path $Root 'package.json') $appStage
Copy-Item (Join-Path $Root 'package-lock.json') $appStage
if(Test-Path (Join-Path $Root '.env')){Copy-Item (Join-Path $Root '.env') $appStage}else{Copy-Item (Join-Path $Root '.env.example') (Join-Path $appStage '.env')}
if(-not $SkipBackendInstall){
  Push-Location $appStage
  try{npm ci --omit=dev --ignore-scripts;if($LASTEXITCODE -ne 0){throw 'npm ci do backend falhou.'}}finally{Pop-Location}
}
Remove-ProductionJunk $appStage
Write-Host 'Backend de produção limpo: testes, benchmarks, docs, source maps e caches removidos.'

Step '3/8 - Empacotando Node.js 24 portátil'
$index=Invoke-RestMethod 'https://nodejs.org/dist/index.json'
$release=$index|Where-Object{$_.version -like 'v24.*' -and $_.lts}|Select-Object -First 1
if(-not $release){throw 'Não foi possível localizar Node.js 24 LTS.'}
$nodeVersion=$release.version
$zipName="node-$nodeVersion-win-x64.zip"
$nodeZip=Join-Path $Cache $zipName
Download "https://nodejs.org/dist/$nodeVersion/$zipName" $nodeZip
$checksums=Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt"
$line=($checksums.Content -split "`n"|Where-Object{$_ -match [regex]::Escape($zipName)}|Select-Object -First 1)
if(-not $line){throw 'Checksum oficial do Node não encontrado.'}
$expected=($line -split '\s+')[0].Trim().ToLowerInvariant()
Ensure-Hash "https://nodejs.org/dist/$nodeVersion/$zipName" $nodeZip $expected 'Node.js'
$nodeExtract=Join-Path $Temp 'node'
New-Item -ItemType Directory -Path $nodeExtract -Force|Out-Null
Expand-Archive -Path $nodeZip -DestinationPath $nodeExtract -Force
$runtime=Join-Path $Staging 'runtime';New-Item -ItemType Directory -Path $runtime -Force|Out-Null
Copy-Item (Join-Path $nodeExtract "node-$nodeVersion-win-x64\node.exe") $runtime
Write-Host "Node empacotado: $nodeVersion"

# V3.0.1: o Tauri é compilado ANTES de baixar Python/Ollama/FFmpeg. Assim o
# pico de uso do disco cai vários GB. O target também é isolado e removido após
# copiar o executável, evitando que um build anterior ocupe todo o C:.
Step '4/8 - Compilando Sonota Desktop (Tauri)'
Assert-BuildSpace 6
if(Test-Path $CargoTarget){Remove-Item $CargoTarget -Recurse -Force}
New-Item -ItemType Directory -Path $CargoTarget -Force|Out-Null
$env:CARGO_TARGET_DIR=$CargoTarget
$env:CARGO_INCREMENTAL='0'
if(-not $SkipDesktopInstall){
  if(Test-Path (Join-Path $Desktop 'package-lock.json')){npm --prefix $Desktop ci}else{npm --prefix $Desktop install}
  if($LASTEXITCODE -ne 0){throw 'Falha ao instalar dependências do Tauri.'}
}
npm --prefix $Desktop run build
if($LASTEXITCODE -ne 0){
  $free=Free-GB $Root
  throw "Falha ao compilar o Sonota Desktop. Espaço livre atual: $free GB. Se o log mostrar 'os error 112' ou 'no space on device', libere espaço no disco e tente novamente."
}
$tauriExe=Join-Path $CargoTarget 'release\sonota-desktop.exe'
if(-not(Test-Path $tauriExe)){throw "Executável Tauri não encontrado: $tauriExe"}
Copy-Item $tauriExe (Join-Path $Staging 'Sonota.exe') -Force
Copy-Item (Join-Path $Desktop 'src-tauri\icons\icon.ico') (Join-Path $Staging 'Sonota.ico') -Force
if(-not $KeepRustTarget){
  Write-Host 'Limpando artefatos Rust após copiar Sonota.exe...'
  Remove-Item $CargoTarget -Recurse -Force
}
Write-Host "Espaço livre após o Tauri: $(Free-GB $Root) GB"

Step '5/8 - Empacotando pré-requisitos para outros computadores'
$tools=Join-Path $Staging 'tools';New-Item -ItemType Directory -Path $tools -Force|Out-Null

$pythonEmbed=Join-Path $Cache 'python-3.10.11-embed-amd64.zip'
Download 'https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip' $pythonEmbed
$pythonExpected='608619f8619075629c9c69f361352a0da6ed7e62f83a0e19c63e0ea32eb7629d'
Ensure-Hash 'https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip' $pythonEmbed $pythonExpected 'Python embutido 3.10.11'
Copy-Item $pythonEmbed $tools -Force

$getPip=Join-Path $Cache 'get-pip.py'
if(-not(Test-Path -LiteralPath $getPip)){
  Write-Host 'Baixando bootstrap oficial do pip...'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip
}
Copy-Item $getPip $tools -Force

$ollamaZip=Join-Path $Cache 'ollama-windows-amd64.zip'
Download 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip' $ollamaZip
Copy-Item $ollamaZip $tools -Force

$webviewInstaller=Join-Path $Cache 'MicrosoftEdgeWebview2Setup.exe'
Download 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' $webviewInstaller
try{Verify-Signature $webviewInstaller 'Microsoft'}catch{
  Write-Warning 'WebView2 em cache inválido. Baixando novamente.'
  Remove-Item -LiteralPath $webviewInstaller -Force -ErrorAction SilentlyContinue
  Download 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' $webviewInstaller
  Verify-Signature $webviewInstaller 'Microsoft'
}
Copy-Item $webviewInstaller $tools -Force

$ffmpegZip=Join-Path $Cache 'ffmpeg-release-essentials.zip'
Download 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $ffmpegZip
$ffmpegExtract=Join-Path $Temp 'ffmpeg'
if(Test-Path $ffmpegExtract){Remove-Item $ffmpegExtract -Recurse -Force}
Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegExtract -Force
$ffmpegExe=Get-ChildItem -LiteralPath $ffmpegExtract -Filter ffmpeg.exe -File -Recurse|Select-Object -First 1
$ffprobeExe=Get-ChildItem -LiteralPath $ffmpegExtract -Filter ffprobe.exe -File -Recurse|Select-Object -First 1
if(-not $ffmpegExe -or -not $ffprobeExe){throw 'FFmpeg/ffprobe não encontrados no ZIP baixado.'}
$ffmpegStage=Join-Path $runtime 'ffmpeg';New-Item -ItemType Directory -Path $ffmpegStage -Force|Out-Null
Copy-Item $ffmpegExe.FullName (Join-Path $ffmpegStage 'ffmpeg.exe') -Force
Copy-Item $ffprobeExe.FullName (Join-Path $ffmpegStage 'ffprobe.exe') -Force
Write-Host "FFmpeg empacotado: $($ffmpegExe.FullName)"

Step '6/8 - Adicionando scripts de provisionamento V3.2.0'
foreach($name in @('install-ai.ps1','install-audio.ps1','ensure-webview2.ps1','diagnose-v3.ps1')){Copy-Item (Join-Path $InstallerDir $name) (Join-Path $tools $name) -Force}
$audioText=Get-Content (Join-Path $tools 'install-audio.ps1') -Raw -Encoding UTF8
$aiText=Get-Content (Join-Path $tools 'install-ai.ps1') -Raw -Encoding UTF8
$webText=Get-Content (Join-Path $tools 'ensure-webview2.ps1') -Raw -Encoding UTF8
if($audioText -notmatch 'SONOTA_AUDIO_INSTALLER_V320'){throw 'install-audio.ps1 V3.2.0 incorreto.'}
if($aiText -notmatch 'SONOTA_AI_INSTALLER_V320'){throw 'install-ai.ps1 V3.2.0 incorreto.'}
if($webText -notmatch 'SONOTA_WEBVIEW_INSTALLER_V300'){throw 'ensure-webview2.ps1 incompatível.'}

Step '7/8 - Validando pacote completo'
$required=@(
 'Sonota.exe','Sonota.ico','runtime\node.exe','runtime\ffmpeg\ffmpeg.exe','runtime\ffmpeg\ffprobe.exe',
 'app\src\server.js','app\audio\worker.py','app\audio\requirements-desktop.txt','app\public\ionic\index.html','app\node_modules\express\package.json',
 'tools\install-ai.ps1','tools\install-audio.ps1','tools\ensure-webview2.ps1','tools\diagnose-v3.ps1','tools\python-3.10.11-embed-amd64.zip','tools\get-pip.py','tools\ollama-windows-amd64.zip','tools\MicrosoftEdgeWebview2Setup.exe'
)
foreach($item in $required){if(-not(Test-Path (Join-Path $Staging $item))){throw "Arquivo obrigatório ausente no staging: $item"}}
Write-Host 'Staging V3.2.0 validado.' -ForegroundColor Green

# Remove somente extrações temporárias. O staging contém tudo que o Inno usa.
if(Test-Path $Temp){Remove-Item $Temp -Recurse -Force}
Write-Host "Espaço livre antes do Inno Setup: $(Free-GB $Root) GB"

if($SkipInstaller){
 Step '8/8 - Instalador ignorado por parâmetro'
 Write-Host "Executável de teste: $(Join-Path $Staging 'Sonota.exe')"
 exit 0
}

Step '8/8 - Gerando Sonota-Setup.exe V3.2.0'
$iscc=Get-Command ISCC.exe -ErrorAction SilentlyContinue
if($iscc){$isccPath=$iscc.Source}elseif(Test-Path "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"){$isccPath="${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"}elseif(Test-Path "$env:ProgramFiles\Inno Setup 6\ISCC.exe"){$isccPath="$env:ProgramFiles\Inno Setup 6\ISCC.exe"}else{throw 'Inno Setup 6 não encontrado.'}
Push-Location $InstallerDir
try{& $isccPath 'Sonota-Desktop.iss'}finally{Pop-Location}
if($LASTEXITCODE -ne 0){throw 'O Inno Setup não conseguiu gerar o instalador.'}
$setup=Join-Path $InstallerDir 'output\Sonota-Setup.exe'
if(-not(Test-Path $setup)){throw 'Sonota-Setup.exe não foi criado.'}
$hash=(Get-FileHash -Algorithm SHA256 $setup).Hash
Set-Content -LiteralPath (Join-Path $InstallerDir 'output\Sonota-Setup.sha256.txt') -Value "$hash  Sonota-Setup.exe" -Encoding ASCII
Write-Host "`n[OK] Sonota V3.2.0 pronto: $setup" -ForegroundColor Green
Write-Host "SHA-256: $hash"
Write-Host 'O usuário final instala somente Sonota-Setup.exe. Node, Python portátil, FFmpeg, WebView2 e Ollama portátil são preparados pelo Setup.'
