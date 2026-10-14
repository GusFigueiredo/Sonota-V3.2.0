SONOTA V3.0.1 - INSTALADOR PARA COMPUTADORES LIMPOS
===================================================

Objetivo desta versão
---------------------
A V3.0.1 foi criada para eliminar a situação em que o Sonota abre normalmente em
um segundo computador, mas a IA ou o Laboratório de Arranjos ficam desativados.

O que o Sonota-Setup.exe prepara
--------------------------------
1. Sonota Desktop / Tauri.
2. Frontend Ionic Angular.
3. Backend Node.js 24 portátil.
4. Banco SQLite local.
5. Microsoft Edge WebView2, se necessário.
6. FFmpeg e FFprobe empacotados dentro do Sonota.
7. Python 3.10.11 isolado em runtime\python310.
8. Ambiente Python do Laboratório em runtime\audio-python.
9. PyTorch CPU + torchaudio.
10. Basic Pitch + ONNX Runtime.
11. music21.
12. Demucs htdemucs.
13. Ollama.
14. qwen3:1.7b.
15. qwen3:8b.
16. qwen3-embedding:0.6b.

Mudanças importantes da V3.0.1
-----------------------------
- O computador final não depende mais de Python ou FFmpeg já instalados.
- O instalador não depende do winget para Python/FFmpeg.
- setuptools fica fixado em 80.9.0 para manter pkg_resources usado pelo
  Basic Pitch 0.4.0.
- Avisos do Basic Pitch no stderr não são mais tratados como falha quando o
  processo termina com exit code 0.
- O instalador de áudio valida Stems, MIDI e Partitura antes de retornar sucesso.
- Um autoteste real do Basic Pitch é executado.
- O modelo htdemucs é preparado durante a instalação.
- A IA valida Ollama, os três modelos Qwen, chat e embeddings.
- Erros de IA/áudio retornam código diferente de zero. O Setup não apresenta a
  instalação como concluída quando um recurso obrigatório falha.
- O Tauri tenta iniciar `ollama serve` automaticamente quando o Sonota abre.
- O Assistente possui opção "Reparar IA" caso o runtime seja danificado depois.
- O Laboratório mantém a opção "Reparar recursos de áudio".
- Os dados de desenvolvimento foram removidos da entrega V3.0.1.

Requisitos da máquina que GERA o instalador
--------------------------------------------
- Windows 10/11 x64
- Node.js 24
- npm
- Rust/Cargo
- Inno Setup 6
- Internet

Gerar
-----
Execute:

installer\windows\Criar-Sonota-Desktop.bat

Saída:

installer\windows\output\Sonota-Setup.exe
installer\windows\output\Sonota-Setup.sha256.txt

Requisitos do computador FINAL
------------------------------
- Windows 10/11 x64.
- Internet durante a primeira instalação para pacotes Python e modelos Qwen.
- Espaço em disco suficiente para os modelos de IA e dependências de áudio.
- O usuário não precisa instalar Node, npm, Rust, Python, FFmpeg ou Ollama
  manualmente.

Teste final recomendado
-----------------------
Teste o Setup em um computador/VM onde nunca houve Sonota, Python, FFmpeg ou
Ollama. Após instalar, confirme:

- o Sonota abre;
- o Assistente mostra "IA local pronta";
- a Busca Inteligente usa a IA local;
- Laboratório mostra Stems, MIDI e Partitura como prontos;
- um MIDI de teste consegue ser gerado;
- Stems iniciam sem pedir instalação adicional.

Logs
----
%LOCALAPPDATA%\Sonota\logs\installer-audio.log
%LOCALAPPDATA%\Sonota\logs\installer-ai.log
%LOCALAPPDATA%\Sonota\logs\backend.log
%LOCALAPPDATA%\Sonota\logs\ollama-runtime.log
