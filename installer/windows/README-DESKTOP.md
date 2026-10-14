# Gerar o Sonota V3.2.0 para Windows

Execute no Windows:

```bat
Criar-Sonota-Desktop.bat
```

Saída:

```text
installer\windows\output\Sonota-Setup.exe
installer\windows\output\Sonota-Setup.sha256.txt
```

## O que mudou na V3.2.0

O computador final recebe um **instalador único**. Ele não precisa ter Node, npm, Rust, Python, FFmpeg ou Ollama instalados previamente.

O build inclui dentro do `Sonota-Setup.exe`:

- runtime Node.js 24;
- Python 3.10.11 portátil (embedded);
- `ffmpeg.exe` e `ffprobe.exe`;
- Ollama portátil;
- bootstrapper do Microsoft Edge WebView2;
- backend, frontend Angular e scripts de provisionamento.

Durante a instalação no computador final, o Setup:

1. verifica/instala WebView2;
2. cria o Python 3.10 isolado do Sonota;
3. instala e valida Basic Pitch, music21, Demucs e PyTorch;
4. executa autoteste de MIDI e prepara `htdemucs`;
5. instala/inicia Ollama;
6. baixa `qwen3:1.7b` e `qwen3-embedding:0.6b`;
7. valida chat e embeddings;
8. migra instalações antigas para o agente 1.7B e tenta remover a cópia legada do 8B;
9. só então conclui o provisionamento obrigatório.

> A primeira instalação precisa de internet, porque os pacotes Python e os modelos Qwen são baixados para o computador final.

## Logs

```text
%LOCALAPPDATA%\Sonota\logs\installer-audio.log
%LOCALAPPDATA%\Sonota\logs\installer-ai.log
%LOCALAPPDATA%\Sonota\logs\backend.log
%LOCALAPPDATA%\Sonota\logs\ollama-runtime.log
```

## Diagnóstico manual

Depois da instalação, se quiser validar todos os componentes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Programs\Sonota\tools\diagnose-v3.ps1"
```

O JSON final deve mostrar `"ok": true`.

## Testar staging sem criar o Setup

```powershell
powershell -ExecutionPolicy Bypass -File build-release.ps1 -SkipInstaller
```


### V3.1.0
O Python e o Ollama são portáteis dentro da instalação do Sonota. A V3.1.0 elimina o Qwen 8B obrigatório, usa o Qwen 1.7B no FAST e no agente, aquece também embeddings e reduz o conteúdo de produção do backend antes de gerar o Setup.
