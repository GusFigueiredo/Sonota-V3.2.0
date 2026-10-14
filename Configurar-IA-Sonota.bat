@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo       CONFIGURADOR DA IA LOCAL DO SONOTA V3.2.0
echo ============================================================
echo.
where ollama >nul 2>&1
if errorlevel 1 (
  echo O Ollama nao foi encontrado neste computador.
  echo Instale o Ollama para Windows e execute este arquivo novamente.
  echo Site oficial: https://ollama.com/download/windows
  echo.
  pause
  exit /b 1
)

if not exist .env copy /Y .env.example .env >nul

rem # Configuracoes compactas da V3.2.0
findstr /B /C:"AI_ENABLED=" .env >nul 2>&1 || echo AI_ENABLED=true>>.env
findstr /B /C:"OLLAMA_URL=" .env >nul 2>&1 || echo OLLAMA_URL=http://127.0.0.1:11434>>.env
findstr /B /C:"AI_FAST_ENABLED=" .env >nul 2>&1 || echo AI_FAST_ENABLED=true>>.env
findstr /B /C:"AI_FAST_MODEL=" .env >nul 2>&1 || echo AI_FAST_MODEL=qwen3:1.7b>>.env
findstr /B /C:"EMBEDDING_MODEL=" .env >nul 2>&1 || echo EMBEDDING_MODEL=qwen3-embedding:0.6b>>.env
findstr /B /C:"AI_MAX_STEPS=" .env >nul 2>&1 || echo AI_MAX_STEPS=3>>.env
findstr /B /C:"AI_MEMORY_MESSAGES=" .env >nul 2>&1 || echo AI_MEMORY_MESSAGES=4>>.env
findstr /B /C:"AI_TIMEOUT_SECONDS=" .env >nul 2>&1 || echo AI_TIMEOUT_SECONDS=180>>.env
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

rem # Migra AGENT_MODEL antigo para o mesmo Qwen leve usado no modo FAST.
powershell -NoProfile -Command "$p='.env'; $s=[IO.File]::ReadAllText($p); if($s -match '(?m)^AGENT_MODEL='){ $s=$s -replace '(?m)^AGENT_MODEL=.*$','AGENT_MODEL=qwen3:1.7b' } else { $s += \"`r`nAGENT_MODEL=qwen3:1.7b\" }; [IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))" >nul 2>&1

echo [1/2] Baixando modelo de conversa: qwen3:1.7b
ollama pull qwen3:1.7b
if errorlevel 1 goto :erro

echo.
echo [2/2] Baixando modelo de busca semantica: qwen3-embedding:0.6b
ollama pull qwen3-embedding:0.6b
if errorlevel 1 goto :erro

echo.
echo IA local configurada.
echo - qwen3:1.7b = modo FAST e agente completo
echo - qwen3-embedding:0.6b = busca semantica da Biblioteca
echo - qwen3:8b nao e mais necessario na V3.2.0
echo.
echo O Sonota aquece os modelos automaticamente para reduzir a espera da primeira consulta.
pause
exit /b 0

:erro
echo.
echo Nao foi possivel baixar um dos modelos. Confira a internet e se o Ollama esta iniciado.
pause
exit /b 1
