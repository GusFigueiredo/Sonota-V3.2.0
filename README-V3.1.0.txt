SONOTA V3.1.0 - IA MAIS LEVE E BUSCA MAIS RAPIDA

PRINCIPAIS MUDANCAS
- qwen3:8b removido dos requisitos obrigatorios.
- qwen3:1.7b agora atende FAST e agente completo.
- qwen3-embedding:0.6b continua responsavel pela busca semantica.
- Instalador valida somente os dois modelos realmente necessarios.
- Em upgrade, o instalador tenta remover a copia legada do qwen3:8b mantida pelo Sonota.
- Contexto, memoria, tokens de saida e numero maximo de etapas foram reduzidos.
- O agente seleciona somente as tools relacionadas ao pedido quando isso e seguro.
- Warm-up do Qwen e do modelo de embeddings.
- Biblioteca pre-calcula embeddings em segundo plano no cadastro/edicao e no bootstrap.
- FTS5 deixa de ser reconstruido por completo em toda pesquisa.
- Build de producao remove testes, benchmarks, docs, source maps e caches desnecessarios de node_modules/audio.

MODELOS OBRIGATORIOS
- qwen3:1.7b
- qwen3-embedding:0.6b

O computador final continua sem precisar ter Node, Python, Ollama ou FFmpeg instalados antes do Setup.
