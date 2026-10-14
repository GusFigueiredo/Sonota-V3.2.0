@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo                 SONOTA V3.2.0 - INSTALADOR FINAL
echo ============================================================
echo.
echo Este build gera um unico Sonota-Setup.exe com:
echo - Node.js 24 portatil

echo - Python 3.10.11 portatil (embutido)

echo - FFmpeg / FFprobe

echo - Ollama portatil

echo - modelos Qwen baixados e validados durante a instalacao

echo - Laboratorio: Stems, MIDI e Partitura

echo.
echo A maquina de build precisa de Node 24, Rust/Cargo e Inno Setup 6.
echo O computador do usuario final nao precisa desses itens instalados previamente.
echo O build verifica espaco livre antes do Tauri e limpa artefatos Rust temporarios.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release.ps1"
if errorlevel 1 (
  echo.
  echo [ERRO] A geracao do instalador falhou.
  pause
  exit /b 1
)

echo.
echo [OK] Sonota V3.2.0 gerado em installer\windows\output\Sonota-Setup.exe
pause
