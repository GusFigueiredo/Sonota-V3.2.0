# Sonota AI Local — arquitetura implementada

> **Atualização V2.6:** o agente desta documentação continua existindo, mas comandos simples agora passam primeiro pelo **Fast Action Mode** (`qwen3:1.7b`). Consulte `IA-FAST-V2.6.md` para a arquitetura atual de desempenho.

Esta versão substitui o "cérebro" limitado por regex por uma arquitetura de agente local baseada em **Ollama + Qwen3**, sem exigir API paga.

> Comentários importantes nos arquivos novos usam o padrão `// # ...` (JavaScript) ou `-- # ...` (SQL) para facilitar a leitura durante o TCC.

## 1. Como ativar

1. Instale o Ollama no computador.
2. Execute `Configurar-IA-Sonota.bat` uma vez.
3. O script baixa:
   - `qwen3:1.7b` — ações/consultas rápidas;
   - `qwen3:8b` — agente complexo/tool calling;
   - `qwen3-embedding:0.6b` — busca semântica.
4. Execute `Iniciar-Sonota.bat` normalmente.

O `Iniciar-Sonota.bat` cria `.env` automaticamente a partir de `.env.example` quando necessário.

Se o Ollama não estiver disponível, o Sonota usa o interpretador legado como fallback.

---

# 2. Onde foi alterado

## `src/ai/ollama.js`
Cliente HTTP do Ollama.

Blocos:
- `# Cliente HTTP mínimo para Ollama`: chama `/api/chat` com tool calling/structured output.
- `# Embeddings locais`: chama `/api/embed`.
- `# Verificação rápida`: verifica se Ollama/modelos estão disponíveis.

## `src/ai/agent.js`
Novo cérebro do Assistente Sonota.

Blocos:
- `# Prompt do agente operacional`: regras de segurança e escopo.
- `# Loop de tool calling`: permite que o Qwen use várias ferramentas antes de responder.

O agente NÃO recebe SQL e NÃO grava diretamente no banco.

## `src/ai/tools.js`
Catálogo completo de ferramentas que a IA pode usar.

### Leitura
- clientes;
- projetos;
- arranjos;
- Busca Inteligente da Biblioteca;
- financeiro;
- prazos;
- alertas;
- versões;
- histórico;
- documentos;
- processamentos de áudio;
- perfil;
- navegação.

### Criação
- cliente;
- projeto.

**Não existe tool para criar arranjo.**

### Edição
- cliente;
- projeto;
- pagamento/financeiro;
- metadados de arranjo já existente;
- versões;
- marcação de versão enviada;
- dados não sensíveis do perfil.

### Exclusão
- cliente;
- projeto;
- arranjo;
- versão;
- documento;
- processamento de áudio.

### Laboratório
- iniciar análise/stems/MIDI/partitura;
- cancelar processamento;
- excluir processamento concluído/cancelado.

Todas as tools de escrita começam com `propor_` e apenas criam uma proposta para confirmação.

## `src/ai/actions.js`
Executa uma proposta somente depois do clique do usuário em **Confirmar**.

Principais pontos:
- confirmação com validade de 5 minutos;
- transação SQLite;
- controle de versão para evitar sobrescrever alterações feitas em outra tela;
- propostas em lote;
- dependências entre operações.

Exemplo suportado:

```
"Cadastre Lucas Studio e crie Comercial Porsche para ele usando Theme Aurora por 6 mil"
```

O agente prepara duas operações em um único card. Ao confirmar:
1. cria Lucas Studio;
2. recebe o ID novo;
3. cria Comercial Porsche com esse cliente;
4. relaciona o arranjo existente.

Se qualquer etapa falhar, a transação é revertida.

## `src/ai/memory.js`
Memória curta por usuário.

Canais separados:
- `assistant`;
- `search`.

Essa memória guarda apenas mensagens recentes. Dados empresariais continuam sendo consultados pelas tools no banco atual.

## `src/assistant.js`
Agora é a porta de entrada.

- IA ativa → `runAgent()`;
- Ollama fora do ar → `assistant-legacy.js`.

## `src/assistant-legacy.js`
É o antigo `assistant.js`, preservado como fallback.

## `src/search.js`
Busca Inteligente reestruturada.

Fluxo:

```
Pergunta em linguagem natural
        ↓
Qwen3 planeja filtros
        ↓
SQL / metadados exatos
        +
FTS5 / palavras
        +
Qwen3 Embedding / significado
        ↓
Ranking combinado
        ↓
Resposta do chat + resultados
```

O parser antigo continua como fallback.

## `src/migrations/004_ai_agent.sql`
Adiciona:
- `ai_messages`: memória curta de conversa;
- `arrangement_fts`: índice FTS5 da Biblioteca.

## `src/config.js`
Novas configurações:

```env
AI_ENABLED=true
OLLAMA_URL=http://127.0.0.1:11434
AI_FAST_ENABLED=true
AI_FAST_MODEL=qwen3:1.7b
AI_FAST_CONTEXT=2048
AI_FAST_NUM_PREDICT=192
AGENT_MODEL=qwen3:8b
EMBEDDING_MODEL=qwen3-embedding:0.6b
AI_MAX_STEPS=4
AI_MEMORY_MESSAGES=8
AI_TIMEOUT_SECONDS=300
AI_AGENT_CONTEXT=4096
AI_AGENT_NUM_PREDICT=320
AI_THINKING=false
AI_KEEP_ALIVE=1h
AI_WARMUP=true
```

## `src/app.js`
Mudanças principais:
- `/api/assistant/message` agora é assíncrono e recebe contexto da tela;
- confirmação usa `confirmAssistantProposal()`;
- novo `/api/ai/status`;
- capabilities incluem informações da IA.

## `mobile/src/components/Assistant.jsx`
O chat envia também:
- página atual;
- ID do projeto atualmente aberto.

Isso permite comandos contextuais como:

```
"marca este projeto como concluído"
```

quando o usuário está dentro de um projeto.

O card de confirmação também mostra quando existem várias ações na mesma proposta.

## `mobile/src/pages/SearchPage.jsx`
Usa a resposta textual gerada pela Busca Inteligente e identifica quando a consulta foi planejada pela IA local.

## `mobile/src/api.js`
- `assistant(message, context)`;
- `aiStatus()`.

## `.env.example`
Configuração pronta para os dois modelos locais.

## `Configurar-IA-Sonota.bat`
Baixa os modelos necessários pelo Ollama.

---

# 3. Regras do Assistente implementadas

## O agente pode

- consultar qualquer dado operacional disponibilizado pelas tools;
- criar cliente;
- criar projeto;
- criar um projeto relacionando cliente e arranjo existentes;
- criar cliente e projeto dependente na mesma solicitação;
- editar cliente;
- editar projeto;
- alterar status;
- alterar pagamento;
- alterar valor/prazo/vencimento;
- editar metadados de arranjos existentes;
- excluir cliente/projeto/arranjo quando as regras do sistema permitirem;
- consultar/editar/excluir versões;
- marcar versão enviada;
- consultar/excluir documentos;
- consultar histórico;
- iniciar/cancelar/remover trabalhos do Laboratório;
- editar dados não sensíveis do perfil.

## O agente não pode

- criar arranjos novos pelo chat;
- inventar upload de áudio/documento;
- trocar senha;
- trocar e-mail sem a validação própria da tela;
- alterar avatar sem upload;
- executar SQL livre;
- ignorar confirmação para operações de escrita.

---

# 4. Segurança contra interpretações erradas

A IA pode entender linguagem natural, porém o backend continua responsável por:

- identificar registros;
- recusar nomes ambíguos;
- validar Zod;
- conferir `user_id`;
- verificar versão do registro;
- validar relacionamentos;
- impedir exclusões proibidas;
- registrar auditoria;
- registrar histórico do projeto;
- executar a transação.

Assim o LLM escolhe **o que pedir**, mas o Sonota decide **o que é válido executar**.

---

# 5. Testes adicionados

Arquivo: `tests/ai-agent.test.js`

Valida:
1. tool calling real do agente (mock do protocolo Ollama);
2. edição de projeto só depois da confirmação;
3. criação em lote de cliente + projeto dependente;
4. planejador da Busca Inteligente + embeddings.

Toda a suíte antiga continua ativa para garantir que a IA não quebre CRUD, autenticação, arquivos, financeiro e fallback.
