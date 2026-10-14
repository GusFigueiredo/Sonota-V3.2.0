# Sonota V3.1.0

## IA local
- `qwen3:8b` removido do fluxo obrigatório.
- `qwen3:1.7b` passa a ser `AI_FAST_MODEL` e `AGENT_MODEL`.
- `qwen3-embedding:0.6b` permanece como modelo semântico.
- instalação não falha mais por não conseguir baixar o antigo modelo 8B.
- configurações padrão mais curtas: 3 etapas, 4 mensagens de memória, contexto FAST 1536, contexto AGENT 3072 e respostas menores.
- seleção de tools por domínio no agente.
- warm-up do chat e dos embeddings.

## Biblioteca / Busca Inteligente
- embeddings são preparados em segundo plano no cadastro/edição dos arranjos.
- o bootstrap inicia uma pré-indexação não bloqueante da Biblioteca.
- o FTS5 passa a ser persistente/incremental em vez de reconstruído integralmente em cada busca.
- a busca ainda mantém fallback local caso Ollama/embeddings estejam indisponíveis.

## Instalador
- passa a exigir somente `qwen3:1.7b` + `qwen3-embedding:0.6b`.
- tenta remover o modelo legado `qwen3:8b` de instalações anteriores do Sonota.
- limpa arquivos de desenvolvimento desnecessários do backend de produção antes do Inno Setup.
- remove `__pycache__` e `.pyc` do pacote de áudio.
