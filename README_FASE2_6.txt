Sonota V2.7 Desktop - Fase 2.6

Correção principal:
- install-audio.ps1 não polui mais o retorno de Install-Python310 com mensagens de log/winget.
- valida caminho real do Python 3.10 antes de criar o venv.
- remove venv incompleto antes de recriar.
- registra saída do pip no installer-audio.log.
- retorna exit 1 em falha, em vez de mascarar o erro.
