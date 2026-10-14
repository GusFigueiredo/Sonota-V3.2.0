# SONOTA_AI_INSTALLER_V320
param(
  [string]$InstallRoot = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$RuntimeDir = Join-Path $InstallRoot 'runtime'
$ToolsDir = Join-Path $InstallRoot 'tools'
$AppDir = Join-Path $InstallRoot 'app'
$EnvFile = Join-Path $AppDir '.env'
$StatusFile = Join-Path $RuntimeDir 'ai-status.json'
$LogDir = Join-Path $env:LOCALAPPDATA 'Sonota\logs'
$LogFile = Join-Path $LogDir 'installer-ai.log'
$BundledOllamaZip = Join-Path $ToolsDir 'ollama-windows-amd64.zip'
$OllamaDir = Join-Path $RuntimeDir 'ollama'
$OllamaExe = Join-Path $OllamaDir 'ollama.exe'
$ModelDir = Join-Path $env:LOCALAPPDATA 'Sonota\models\ollama'
$script:StartedPortableOllama=$false

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
New-Item -ItemType Directory -Path $ModelDir -Force | Out-Null

function Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Save-Status([bool]$Ok,[string]$Message,$Models=$null) {
  [ordered]@{
    ok=$Ok
    message=$Message
    updatedAt=(Get-Date).ToString('o')
    models=$Models
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusFile -Encoding UTF8
}

function Set-EnvValue([string]$Path,[string]$Name,[string]$Value) {
  $lines=@()
  if(Test-Path -LiteralPath $Path){$lines=Get-Content -LiteralPath $Path -Encoding UTF8}
  $pattern='^'+[regex]::Escape($Name)+'='
  $found=$false
  $result=foreach($line in $lines){if($line -match $pattern){$found=$true;"$Name=$Value"}else{$line}}
  if(-not $found){$result+="$Name=$Value"}
  $result|Set-Content -LiteralPath $Path -Encoding UTF8
}

function Test-OllamaApi {
  try {
    $r=Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
    return $true
  } catch { return $false }
}

function Prepare-PortableOllama {
  if(Test-Path -LiteralPath $OllamaExe){
    Log "Ollama portátil já existe: $OllamaExe"
    return
  }
  if(-not(Test-Path -LiteralPath $BundledOllamaZip)){
    throw "Pacote portátil do Ollama não encontrado: $BundledOllamaZip"
  }
  Log 'Extraindo Ollama portátil do próprio Sonota...'
  Remove-Item -LiteralPath $OllamaDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $OllamaDir -Force | Out-Null
  Expand-Archive -LiteralPath $BundledOllamaZip -DestinationPath $OllamaDir -Force

  if(-not(Test-Path -LiteralPath $OllamaExe)){
    $found=Get-ChildItem -LiteralPath $OllamaDir -Filter ollama.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if($found -and $found.FullName -ne $OllamaExe){
      $base=Split-Path -Parent $found.FullName
      Get-ChildItem -LiteralPath $base -Force | ForEach-Object { Copy-Item $_.FullName $OllamaDir -Recurse -Force }
    }
  }
  if(-not(Test-Path -LiteralPath $OllamaExe)){throw 'O ZIP portátil do Ollama foi extraído, mas ollama.exe não foi encontrado.'}
  Log "Ollama portátil pronto: $OllamaExe"
}

function Start-OllamaServer {
  if(Test-OllamaApi){return}
  $env:OLLAMA_MODELS=$ModelDir
  Log 'Iniciando o servidor local portátil do Ollama...'
  $script:StartedPortableOllama=$true
  Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
  for($i=0;$i -lt 80;$i++){
    Start-Sleep -Milliseconds 500
    if(Test-OllamaApi){return}
  }
  throw 'O Ollama portátil iniciou, mas a API não respondeu na porta 11434.'
}

function Get-InstalledModels {
  try {
    $data=Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10
    return @($data.models | ForEach-Object { if($_.name){$_.name}elseif($_.model){$_.model} })
  } catch { return @() }
}

function Pull-Model([string]$Model) {
  $models=Get-InstalledModels
  if($models -contains $Model){Log "Modelo $Model já está instalado.";return}

  for($attempt=1;$attempt -le 3;$attempt++){
    Log "Baixando modelo $Model (tentativa $attempt/3)..."
    $stdout=[System.IO.Path]::GetTempFileName()
    $stderr=[System.IO.Path]::GetTempFileName()
    try {
      $env:OLLAMA_MODELS=$ModelDir
      $p=Start-Process -FilePath $OllamaExe -ArgumentList @('pull',$Model) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
      $out=Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue
      $err=Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
      if($out){Add-Content -LiteralPath $LogFile -Value $out.TrimEnd() -Encoding UTF8}
      if($err){Add-Content -LiteralPath $LogFile -Value $err.TrimEnd() -Encoding UTF8}
      if($p.ExitCode -eq 0 -and ((Get-InstalledModels) -contains $Model)){Log "Modelo $Model pronto.";return}
    }
    finally {Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue}
    if($attempt -lt 3){Start-Sleep -Seconds (3*$attempt)}
  }
  throw "Não foi possível baixar ou validar o modelo $Model. Verifique a conexão com a internet."
}

function Test-FastModel {
  Log 'Executando autoteste do modelo rápido...'
  $body=@{
    model='qwen3:1.7b'
    stream=$false
    think=$false
    keep_alive='10m'
    messages=@(@{role='user';content='Responda somente OK.'})
    options=@{num_ctx=512;num_predict=8;temperature=0}
  }|ConvertTo-Json -Depth 8
  $result=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:11434/api/chat' -ContentType 'application/json' -Body $body -TimeoutSec 240
  if(-not $result.message){throw 'O modelo qwen3:1.7b foi instalado, mas não respondeu ao autoteste.'}
}

function Test-Embedding {
  Log 'Executando autoteste do modelo de embeddings...'
  $body=@{model='qwen3-embedding:0.6b';input=@('teste sonota');truncate=$true;keep_alive='10m'}|ConvertTo-Json -Depth 6
  $result=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:11434/api/embed' -ContentType 'application/json' -Body $body -TimeoutSec 240
  if(-not $result.embeddings -or $result.embeddings.Count -lt 1 -or $result.embeddings[0].Count -lt 1){throw 'O modelo de embeddings não respondeu corretamente.'}
}

try {
  Log '=== Sonota V3.2.0 - preparação portátil da IA local ==='
  Save-Status $false 'Preparando Ollama portátil, Qwen 1.7B e embeddings.'

  Prepare-PortableOllama
  Start-OllamaServer

  $required=@('qwen3:1.7b','qwen3-embedding:0.6b')
  foreach($model in $required){Pull-Model $model}

  $installed=Get-InstalledModels
  foreach($model in $required){if($installed -notcontains $model){throw "Modelo obrigatório ausente após instalação: $model"}}

  Test-FastModel
  Test-Embedding

  # V3.2.0: o agente também usa o 1.7B. Se uma instalação anterior do Sonota
  # deixou o 8B no diretório de modelos do Sonota, removemos essa cópia para
  # recuperar vários GB. Falha nessa limpeza não impede a instalação.
  if($script:StartedPortableOllama -and ((Get-InstalledModels) -contains 'qwen3:8b')) {
    try {
      Log 'Removendo modelo legado qwen3:8b para reduzir uso de disco...'
      $env:OLLAMA_MODELS=$ModelDir
      $p=Start-Process -FilePath $OllamaExe -ArgumentList @('rm','qwen3:8b') -Wait -PassThru -WindowStyle Hidden
      if($p.ExitCode -eq 0){Log 'Modelo legado qwen3:8b removido.'}
    } catch { Log "AVISO: não foi possível remover qwen3:8b: $($_.Exception.Message)" }
  }

  Set-EnvValue $EnvFile 'AI_ENABLED' 'true'
  Set-EnvValue $EnvFile 'OLLAMA_URL' 'http://127.0.0.1:11434'
  Set-EnvValue $EnvFile 'AI_FAST_ENABLED' 'true'
  Set-EnvValue $EnvFile 'AI_FAST_MODEL' 'qwen3:1.7b'
  Set-EnvValue $EnvFile 'AGENT_MODEL' 'qwen3:1.7b'
  Set-EnvValue $EnvFile 'EMBEDDING_MODEL' 'qwen3-embedding:0.6b'
  Set-EnvValue $EnvFile 'AI_MAX_STEPS' '3'
  Set-EnvValue $EnvFile 'AI_MEMORY_MESSAGES' '4'
  Set-EnvValue $EnvFile 'AI_TIMEOUT_SECONDS' '180'
  Set-EnvValue $EnvFile 'AI_FAST_TIMEOUT_SECONDS' '60'
  Set-EnvValue $EnvFile 'AI_FAST_CONTEXT' '1536'
  Set-EnvValue $EnvFile 'AI_FAST_NUM_PREDICT' '128'
  Set-EnvValue $EnvFile 'AI_AGENT_CONTEXT' '3072'
  Set-EnvValue $EnvFile 'AI_AGENT_NUM_PREDICT' '192'
  Set-EnvValue $EnvFile 'AI_WARMUP' 'true'
  Set-EnvValue $EnvFile 'AI_WARMUP_EMBEDDING' 'true'

  Save-Status $true 'IA local pronta.' $required
  Log 'SUCESSO: Ollama portátil, Qwen 1.7B e embeddings estão prontos.'
  exit 0
}
catch {
  $message=$_.Exception.Message
  Save-Status $false $message
  Log "ERRO: $message"
  exit 1
}
