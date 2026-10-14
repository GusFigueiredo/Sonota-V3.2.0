# SONOTA_AUDIO_INSTALLER_V320
param(
  [string]$InstallRoot = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$AppDir = Join-Path $InstallRoot 'app'
$AudioDir = Join-Path $AppDir 'audio'
$RuntimeDir = Join-Path $InstallRoot 'runtime'
$PythonDir = Join-Path $RuntimeDir 'python310'
$Python = Join-Path $PythonDir 'python.exe'
$LegacyVenvDir = Join-Path $RuntimeDir 'audio-python'
$FfmpegDir = Join-Path $RuntimeDir 'ffmpeg'
$Ffmpeg = Join-Path $FfmpegDir 'ffmpeg.exe'
$StatusFile = Join-Path $RuntimeDir 'audio-status.json'
$LogDir = Join-Path $env:LOCALAPPDATA 'Sonota\logs'
$LogFile = Join-Path $LogDir 'installer-audio.log'
$BundledPythonZip = Join-Path $InstallRoot 'tools\python-3.10.11-embed-amd64.zip'
$BundledGetPip = Join-Path $InstallRoot 'tools\get-pip.py'
$Worker = Join-Path $AudioDir 'worker.py'
$Requirements = Join-Path $AudioDir 'requirements-desktop.txt'
$EnvFile = Join-Path $AppDir '.env'

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Save-Status([bool]$Ok, [string]$Message, $Capabilities = $null) {
  [ordered]@{
    ok = $Ok
    message = $Message
    updatedAt = (Get-Date).ToString('o')
    capabilities = $Capabilities
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusFile -Encoding UTF8
}

function Set-EnvValue([string]$Path, [string]$Name, [string]$Value) {
  $lines = @()
  if (Test-Path -LiteralPath $Path) { $lines = Get-Content -LiteralPath $Path -Encoding UTF8 }
  $pattern = '^' + [regex]::Escape($Name) + '='
  $found = $false
  $result = foreach ($line in $lines) {
    if ($line -match $pattern) { $found = $true; "$Name=$Value" } else { $line }
  }
  if (-not $found) { $result += "$Name=$Value" }
  $result | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Invoke-NativeCapture {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [string[]]$ArgumentList = @()
  )
  $stdoutFile = [System.IO.Path]::GetTempFileName()
  $stderrFile = [System.IO.Path]::GetTempFileName()
  $old = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $FilePath @ArgumentList 1> $stdoutFile 2> $stderrFile
    $code = $LASTEXITCODE
    $stdout = if (Test-Path -LiteralPath $stdoutFile) { Get-Content -LiteralPath $stdoutFile -Raw -ErrorAction SilentlyContinue } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrFile) { Get-Content -LiteralPath $stderrFile -Raw -ErrorAction SilentlyContinue } else { '' }
    [pscustomobject]@{ ExitCode=[int]$code; Stdout=[string]$stdout; Stderr=[string]$stderr }
  }
  finally {
    $ErrorActionPreference = $old
    Remove-Item -LiteralPath $stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
  }
}

function Last-JsonLine([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  $lines = $Text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  return ($lines | Where-Object { $_.StartsWith('{') -and $_.EndsWith('}') } | Select-Object -Last 1)
}

function Test-Python310([string]$Candidate) {
  if ([string]::IsNullOrWhiteSpace($Candidate) -or -not (Test-Path -LiteralPath $Candidate)) { return $false }
  try {
    $run = Invoke-NativeCapture -FilePath $Candidate -ArgumentList @('-c',"import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    return ($run.ExitCode -eq 0 -and $run.Stdout.Trim() -eq '3.10')
  } catch { return $false }
}

function Prepare-EmbeddedPython {
  if (Test-Python310 $Python) {
    Log "Python portátil 3.10 já está pronto: $Python"
  } else {
    if (-not (Test-Path -LiteralPath $BundledPythonZip)) { throw "Runtime Python portátil não encontrado: $BundledPythonZip" }
    if (-not (Test-Path -LiteralPath $BundledGetPip)) { throw "get-pip.py não encontrado: $BundledGetPip" }

    Log 'Extraindo Python 3.10.11 portátil do próprio Sonota...'
    Remove-Item -LiteralPath $PythonDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $PythonDir -Force | Out-Null
    Expand-Archive -LiteralPath $BundledPythonZip -DestinationPath $PythonDir -Force

    if (-not (Test-Path -LiteralPath $Python)) { throw 'O ZIP do Python foi extraído, mas python.exe não foi encontrado.' }

    $pth = Join-Path $PythonDir 'python310._pth'
    if (-not (Test-Path -LiteralPath $pth)) { throw 'python310._pth não foi encontrado no runtime embutido.' }
    $lines = @(Get-Content -LiteralPath $pth -Encoding ASCII)
    $new = New-Object System.Collections.Generic.List[string]
    $hasSitePackages = $false
    $hasImportSite = $false
    foreach ($line in $lines) {
      $trim = $line.Trim()
      if ($trim -ieq 'Lib\site-packages') { $hasSitePackages = $true }
      if ($trim -ieq 'import site' -or $trim -ieq '#import site') {
        if (-not $hasImportSite) { $new.Add('import site'); $hasImportSite = $true }
      } else { $new.Add($line) }
    }
    if (-not $hasSitePackages) { $new.Add('Lib\site-packages') }
    if (-not $hasImportSite) { $new.Add('import site') }
    $new | Set-Content -LiteralPath $pth -Encoding ASCII
    New-Item -ItemType Directory -Path (Join-Path $PythonDir 'Lib\site-packages') -Force | Out-Null

    if (-not (Test-Python310 $Python)) { throw 'Python portátil 3.10 não iniciou após a extração.' }
    Log "Python portátil confirmado: $Python"
  }

  $pipProbe = Invoke-NativeCapture -FilePath $Python -ArgumentList @('-m','pip','--version')
  if ($pipProbe.ExitCode -ne 0) {
    Log 'Inicializando pip no Python portátil...'
    $boot = Invoke-NativeCapture -FilePath $Python -ArgumentList @($BundledGetPip,'--no-warn-script-location')
    if ($boot.Stdout) { Add-Content -LiteralPath $LogFile -Value $boot.Stdout.TrimEnd() -Encoding UTF8 }
    if ($boot.Stderr) { Add-Content -LiteralPath $LogFile -Value $boot.Stderr.TrimEnd() -Encoding UTF8 }
    if ($boot.ExitCode -ne 0) { throw "Falha ao inicializar pip no Python portátil: $($boot.Stderr.Trim())" }
  }

  # Remove restos do formato antigo baseado em venv. A V3.2.0 não depende mais
  # de instalação do Python no Windows nem de py.exe/PATH/registro.
  Remove-Item -LiteralPath $LegacyVenvDir -Recurse -Force -ErrorAction SilentlyContinue
}

function Invoke-PipRetry {
  param([string[]]$Arguments,[string]$Label)
  $last = $null
  for ($attempt=1; $attempt -le 3; $attempt++) {
    Log "$Label (tentativa $attempt/3)..."
    $last = Invoke-NativeCapture -FilePath $Python -ArgumentList (@('-m','pip','--disable-pip-version-check','--no-input') + $Arguments)
    if ($last.Stdout) { Add-Content -LiteralPath $LogFile -Value $last.Stdout.TrimEnd() -Encoding UTF8 }
    if ($last.Stderr) { Add-Content -LiteralPath $LogFile -Value $last.Stderr.TrimEnd() -Encoding UTF8 }
    if ($last.ExitCode -eq 0) { return }
    if ($attempt -lt 3) { Start-Sleep -Seconds (2 * $attempt) }
  }
  $detail = if ($last.Stderr) { $last.Stderr.Trim() } else { $last.Stdout.Trim() }
  throw "$Label falhou após 3 tentativas: $detail"
}

try {
  Log '=== Sonota V3.2.0 - preparação portátil do Laboratório de Arranjos ==='
  Save-Status $false 'Preparando Python portátil e recursos de áudio.'

  if (-not (Test-Path -LiteralPath $Worker)) { throw 'worker.py não foi encontrado no pacote do Sonota.' }
  if (-not (Test-Path -LiteralPath $Requirements)) { throw 'requirements-desktop.txt não foi encontrado no pacote do Sonota.' }
  if (-not (Test-Path -LiteralPath $Ffmpeg)) { throw 'FFmpeg empacotado não foi encontrado. Recrie o instalador V3.2.0.' }

  Prepare-EmbeddedPython

  $env:PYTHONUTF8 = '1'
  $env:PIP_PREFER_BINARY = '1'
  $env:Path = "$FfmpegDir;$PythonDir;$(Join-Path $PythonDir 'Scripts');$env:Path"

  $pre = Invoke-NativeCapture -FilePath $Python -ArgumentList @($Worker,'--capabilities')
  $preJson = Last-JsonLine $pre.Stdout
  $preCaps = $null
  if ($pre.ExitCode -eq 0 -and $preJson) { try { $preCaps = $preJson | ConvertFrom-Json } catch {} }
  $ready = $preCaps -and $preCaps.midi -and $preCaps.partitura -and $preCaps.stems

  if (-not $ready) {
    Invoke-PipRetry -Arguments @('install','--upgrade','pip','wheel','setuptools==80.9.0') -Label 'Atualização do pip/wheel/setuptools'

    $pkg = Invoke-NativeCapture -FilePath $Python -ArgumentList @('-c',"import pkg_resources; print('pkg_resources OK')")
    if ($pkg.ExitCode -ne 0) { throw "pkg_resources não está disponível: $($pkg.Stderr)" }

    Invoke-PipRetry -Arguments @('install','--upgrade','--force-reinstall','torch==2.0.1+cpu','torchaudio==2.0.2+cpu','--index-url','https://download.pytorch.org/whl/cpu') -Label 'Instalação do PyTorch CPU'
    Invoke-PipRetry -Arguments @('install','--upgrade','-r',$Requirements) -Label 'Instalação das dependências do Laboratório'
    Invoke-PipRetry -Arguments @('install','--force-reinstall','setuptools==80.9.0') -Label 'Fixação do pkg_resources compatível'
  } else {
    Log 'Dependências de áudio já estão completas; instalação pesada ignorada.'
  }

  $pipCheck = Invoke-NativeCapture -FilePath $Python -ArgumentList @('-m','pip','check')
  if ($pipCheck.Stdout) { Add-Content -LiteralPath $LogFile -Value $pipCheck.Stdout.TrimEnd() -Encoding UTF8 }
  if ($pipCheck.Stderr) { Add-Content -LiteralPath $LogFile -Value $pipCheck.Stderr.TrimEnd() -Encoding UTF8 }
  if ($pipCheck.ExitCode -ne 0) { Log 'AVISO: pip check encontrou inconsistências; a validação funcional decidirá se os recursos estão prontos.' }

  Log 'Validando Stems, MIDI e Partitura...'
  $capRun = Invoke-NativeCapture -FilePath $Python -ArgumentList @($Worker,'--capabilities')
  if ($capRun.Stderr) { Add-Content -LiteralPath $LogFile -Value $capRun.Stderr.TrimEnd() -Encoding UTF8 }
  if ($capRun.ExitCode -ne 0) { throw "worker.py falhou: $($capRun.Stderr.Trim())" }
  $capText = Last-JsonLine $capRun.Stdout
  if (-not $capText) { throw 'worker.py não retornou JSON de capacidades.' }
  $caps = $capText | ConvertFrom-Json
  Log "Capacidades detectadas: $capText"
  if (-not $caps.stems) { throw "Stems indisponível: $($caps.details.stems)" }
  if (-not $caps.midi) { throw "MIDI indisponível: $($caps.details.midi)" }
  if (-not $caps.partitura) { throw "Partitura indisponível: $($caps.details.partitura)" }

  $selfTestDir = Join-Path $RuntimeDir 'audio-self-test'
  Remove-Item -LiteralPath $selfTestDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $selfTestDir -Force | Out-Null
  Log 'Executando autoteste real de MIDI/Basic Pitch...'
  $testRun = Invoke-NativeCapture -FilePath $Python -ArgumentList @($Worker,'--self-test','--output',$selfTestDir)
  if ($testRun.Stderr) { Add-Content -LiteralPath $LogFile -Value $testRun.Stderr.TrimEnd() -Encoding UTF8 }
  if ($testRun.ExitCode -ne 0) { throw "Autoteste MIDI falhou: $($testRun.Stderr.Trim())" }
  if (-not (Last-JsonLine $testRun.Stdout)) { throw 'Autoteste MIDI terminou sem resultado JSON.' }
  Remove-Item -LiteralPath $selfTestDir -Recurse -Force -ErrorAction SilentlyContinue

  Log 'Preparando o modelo Demucs htdemucs...'
  $modelRun = Invoke-NativeCapture -FilePath $Python -ArgumentList @($Worker,'--prepare-models')
  if ($modelRun.Stderr) { Add-Content -LiteralPath $LogFile -Value $modelRun.Stderr.TrimEnd() -Encoding UTF8 }
  if ($modelRun.ExitCode -ne 0) { throw "Falha ao preparar o modelo Demucs: $($modelRun.Stderr.Trim())" }

  Set-EnvValue $EnvFile 'AUDIO_ENABLED' 'true'
  Set-EnvValue $EnvFile 'AUDIO_PYTHON' '../runtime/python310/python.exe'
  Set-EnvValue $EnvFile 'AUDIO_TIMEOUT_SECONDS' '3600'

  Save-Status $true 'Stems, MIDI e Partitura estão prontos.' $caps
  Log 'SUCESSO: Laboratório de Arranjos pronto com Python portátil.'
  exit 0
}
catch {
  $message = $_.Exception.Message
  Save-Status $false $message
  try { Set-EnvValue $EnvFile 'AUDIO_ENABLED' 'false' } catch {}
  Log "ERRO: $message"
  exit 1
}
