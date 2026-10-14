# Sonota V3.0.3

## Instalação realmente portátil em computadores limpos

A V3.0.3 elimina a dependência do instalador tradicional do Python no Windows.

### Laboratório de Arranjos

- substitui `python-3.10.11-amd64.exe` pelo runtime oficial **Python 3.10.11 embeddable x64**;
- o Python é extraído diretamente para `runtime\python310`;
- não depende de PATH, `py.exe`, Registry, Microsoft Store ou de uma instalação prévia do Python;
- `pip` é inicializado no próprio runtime do Sonota;
- mantém `setuptools==80.9.0` para compatibilidade com `pkg_resources`/Basic Pitch;
- PyTorch, Basic Pitch, ONNX Runtime, music21, librosa e Demucs são instalados dentro do runtime privado;
- Stems, MIDI e Partitura continuam validados antes de o Setup concluir.

### IA local

- substitui a instalação global do Ollama pelo pacote **standalone** para Windows;
- Ollama fica em `runtime\ollama` e é iniciado pelo próprio Sonota;
- os modelos Qwen ficam em `%LOCALAPPDATA%\Sonota\models\ollama`;
- não depende de PATH, winget ou instalação global do Ollama;
- o Setup continua baixando e validando `qwen3:1.7b`, `qwen3:8b` e `qwen3-embedding:0.6b`.

### Motivo da correção

Em um computador limpo, a V3.0.2 registrou código 0 no primeiro instalador do Python, mas não criou `runtime\python310\python.exe`; a segunda tentativa terminou com código 103. A V3.0.3 remove esse ponto de falha em vez de tentar localizar/reparar Python do Windows.
