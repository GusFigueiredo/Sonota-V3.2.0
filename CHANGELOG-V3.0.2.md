# Sonota V3.0.2

Correção do instalador em computadores diferentes.

## Laboratório de Arranjos
- Corrige o caso em que o instalador oficial do Python 3.10 retorna código `0`, mas não cria `runtime\python310\python.exe`.
- A instalação agora valida o executável de verdade, em vez de confiar somente no exit code.
- Se `TargetDir` for ignorado, o instalador procura Python 3.10 nos caminhos padrão, Registry e `py.exe`.
- Se necessário, faz uma segunda tentativa de instalação no caminho padrão do usuário.
- Só continua depois de executar o Python e confirmar que a versão é 3.10.
- Mantém o ambiente `audio-python`, Basic Pitch, MIDI, Partitura, Demucs e Stems como validações obrigatórias.

## Interface
- Mantidos os alerts/toasts da V3.0.1 para cadastros, edições, exclusões, jobs do Laboratório e ações da IA.
