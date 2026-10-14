@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo                SONOTA V3.2.0 • IONIC ANGULAR
echo ============================================================
echo.

if not exist .env (
  copy /Y .env.example .env >nul
  echo [OK] Arquivo .env criado automaticamente.
)

rem # Acrescenta configuracoes novas sem sobrescrever escolhas do usuario
findstr /B /C:"AI_ENABLED=" .env >nul 2>&1 || echo AI_ENABLED=true>>.env
findstr /B /C:"OLLAMA_URL=" .env >nul 2>&1 || echo OLLAMA_URL=http://127.0.0.1:11434>>.env
findstr /B /C:"AI_FAST_ENABLED=" .env >nul 2>&1 || echo AI_FAST_ENABLED=true>>.env
findstr /B /C:"AI_FAST_MODEL=" .env >nul 2>&1 || echo AI_FAST_MODEL=qwen3:1.7b>>.env
findstr /B /C:"AGENT_MODEL=" .env >nul 2>&1 || echo AGENT_MODEL=qwen3:1.7b>>.env
findstr /B /C:"EMBEDDING_MODEL=" .env >nul 2>&1 || echo EMBEDDING_MODEL=qwen3-embedding:0.6b>>.env
findstr /B /C:"AI_MAX_STEPS=" .env >nul 2>&1 || echo AI_MAX_STEPS=3>>.env
findstr /B /C:"AI_MEMORY_MESSAGES=" .env >nul 2>&1 || echo AI_MEMORY_MESSAGES=4>>.env
findstr /B /C:"AI_TIMEOUT_SECONDS=" .env >nul 2>&1 || echo AI_TIMEOUT_SECONDS=180>>.env
findstr /B /C:"AI_THINKING=" .env >nul 2>&1 || echo AI_THINKING=false>>.env
findstr /B /C:"AI_FAST_TIMEOUT_SECONDS=" .env >nul 2>&1 || echo AI_FAST_TIMEOUT_SECONDS=60>>.env
findstr /B /C:"AI_FAST_CONTEXT=" .env >nul 2>&1 || echo AI_FAST_CONTEXT=1536>>.env
findstr /B /C:"AI_FAST_NUM_PREDICT=" .env >nul 2>&1 || echo AI_FAST_NUM_PREDICT=128>>.env
findstr /B /C:"AI_AGENT_CONTEXT=" .env >nul 2>&1 || echo AI_AGENT_CONTEXT=3072>>.env
findstr /B /C:"AI_AGENT_NUM_PREDICT=" .env >nul 2>&1 || echo AI_AGENT_NUM_PREDICT=192>>.env
findstr /B /C:"AI_KEEP_ALIVE=" .env >nul 2>&1 || echo AI_KEEP_ALIVE=1h>>.env
findstr /B /C:"AI_TEMPERATURE=" .env >nul 2>&1 || echo AI_TEMPERATURE=0>>.env
findstr /B /C:"AI_WARMUP=" .env >nul 2>&1 || echo AI_WARMUP=true>>.env
findstr /B /C:"AI_WARMUP_TIMEOUT_SECONDS=" .env >nul 2>&1 || echo AI_WARMUP_TIMEOUT_SECONDS=120>>.env
findstr /B /C:"AI_WARMUP_EMBEDDING=" .env >nul 2>&1 || echo AI_WARMUP_EMBEDDING=true>>.env
rem V3.2.0 migra automaticamente o agente antigo de 8B para o mesmo Qwen 1.7B.
powershell -NoProfile -Command "$p='.env'; $s=[IO.File]::ReadAllText($p); $s=$s -replace '(?m)^AGENT_MODEL=qwen3:8b$','AGENT_MODEL=qwen3:1.7b'; [IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))" >nul 2>&1

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Instale o Node.js 24 LTS e abra este arquivo novamente.
  pause
  exit /b 1
)
node -e "if (process.versions.node.split('.')[0] !== '24') process.exit(1)"
if errorlevel 1 (
  echo [ERRO] Este projeto precisa do Node.js 24 LTS.
  pause
  exit /b 1
)

if not exist node_modules\express (
  echo [1/5] Instalando dependencias do backend...
  call npm ci
  if errorlevel 1 goto :erro
) else (
  echo [1/5] Backend pronto.
)

if not exist mobile\node_modules\@ionic\angular\package.json (
  echo [2/5] Instalando Ionic Angular...
  call npm --prefix mobile install
  if errorlevel 1 goto :erro
) else (
  echo [2/5] Ionic Angular pronto.
)

echo [3/5] Compilando a interface Ionic Angular...
call npm run ui:build
if errorlevel 1 goto :erro

rem # Modelo pequeno usado para CRUD rapido. Se o Ollama ja existir, a preparacao e automatica.
where ollama >nul 2>&1
if errorlevel 1 (
  echo [4/5] Ollama nao encontrado. IA local ficara no modo compativel.
) else (
  echo [4/5] Verificando modelo rapido da IA...
  ollama list 2>nul | findstr /I /C:"qwen3:1.7b" >nul
  if errorlevel 1 (
    echo       Primeiro uso: baixando qwen3:1.7b para comandos rapidos...
    ollama pull qwen3:1.7b
    if errorlevel 1 echo       [AVISO] Nao foi possivel baixar o modelo rapido agora.
  )
  node --env-file-if-exists=.env scripts\warmup-ai.js
)

echo [5/5] Iniciando Sonota...
echo.
echo Sonota pronto em http://localhost:3000
echo Comandos simples usam o parser/FAST; pedidos complexos usam o mesmo Qwen 1.7B em modo agente.
echo.
call npm start
pause
exit /b 0

:erro
echo.
echo [ERRO] Nao foi possivel preparar o Sonota. Confira a conexao e o erro acima.
pause
exit /b 1
