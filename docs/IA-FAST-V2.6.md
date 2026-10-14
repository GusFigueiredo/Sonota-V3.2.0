# Sonota V2.6 AI Fast — arquitetura de baixa latência

> Procure por comentários `// # ...` nos arquivos da IA. Eles explicam os blocos principais para estudo e apresentação do TCC.

## Objetivo

A V2.5 usava o `qwen3:8b` para praticamente toda mensagem. Em computadores onde esse modelo roda em CPU, até comandos simples poderiam demorar muito.

A V2.6 separa a IA em caminhos diferentes:

```text
Mensagem
   ↓
Saudação simples? ── sim ──> resposta local instantânea
   ↓ não
Modelo FAST qwen3:1.7b
   ↓
Pedido simples? ── sim ──> 1 inferência JSON ──> backend/tools ──> resposta ou card de confirmação
   ↓ não
Agente completo qwen3:8b
   ↓
tool calling multi-etapas somente quando necessário
```

## 1. `src/ai/fast.js`

Novo **Fast Action Mode**.

Responsabilidades:
- interpreta CRUD simples usando `qwen3:1.7b`;
- retorna JSON estruturado, não texto longo;
- suporta várias operações na mesma frase;
- executa as mesmas tools seguras da V2.5;
- não faz segunda chamada ao modelo para escrever uma resposta bonita;
- consultas simples são formatadas pelo backend;
- escritas continuam gerando `assistant_actions` e precisam de confirmação.

Exemplo:

```text
"Cadastre Alfredo, telefone 11999999999"
```

vira em uma inferência:

```json
{
  "mode": "fast",
  "calls": [
    {
      "tool": "propor_criar_cliente",
      "args": {
        "nome": "Alfredo",
        "telefone": "11999999999"
      }
    }
  ]
}
```

O backend valida e cria o card de confirmação.

## 2. `src/assistant.js`

Nova ordem de execução:

1. `instant` — saudações como `oi` não chamam IA;
2. `fast` — CRUD e consultas diretas;
3. `agent` — perguntas complexas;
4. `fallback` — interpretador legado se Ollama estiver fora do ar.

## 3. `src/ai/ollama.js`

Alterações de desempenho:
- `think:false`;
- `keep_alive` configurável;
- limite de contexto por modo;
- limite de tokens de saída;
- temperatura baixa/zero;
- warm-up do modelo pequeno;
- status agora informa modelo FAST e agente completo.

## 4. `src/ai/agent.js`

O agente completo continua com todas as tools da V2.5, porém agora é reservado para pedidos realmente complexos.

O agente usa por padrão:
- `think:false`;
- contexto de 4096 tokens;
- no máximo 320 tokens de saída por chamada;
- no máximo 4 etapas;
- `keep_alive=1h`.

## 5. `src/search.js`

A Busca Inteligente foi otimizada para não chamar LLM desnecessariamente.

Busca inicial:

```text
parser local + SQL/filtros + FTS5 + qwen3-embedding
```

O planejador `qwen3:1.7b` só é usado quando a frase parece um refinamento conversacional, por exemplo:

```text
"agora só as mais futuristas"
"dessas, tira as com guitarra"
```

A resposta textual final é determinística; não existe uma segunda inferência só para dizer quantos resultados foram encontrados.

## 6. `scripts/warmup-ai.js`

Chamado pelo `Iniciar-Sonota.bat`.

Ele carrega `qwen3:1.7b` antes de o usuário começar a conversar e mantém o modelo em memória pelo período de `AI_KEEP_ALIVE`.

O `qwen3:8b` não é aquecido no início para não bloquear a abertura do sistema em PCs modestos.

## 7. `Iniciar-Sonota.bat`

Na primeira execução:
- acrescenta as novas configurações no `.env`;
- detecta Ollama;
- baixa automaticamente `qwen3:1.7b` se estiver ausente;
- aquece o modelo rápido;
- inicia o Sonota.

## 8. `Configurar-IA-Sonota.bat`

Prepara três modelos:

```text
qwen3:1.7b              → CRUD/consultas rápidas
qwen3:8b                → agente complexo
qwen3-embedding:0.6b    → busca semântica
```

## 9. Configuração `.env`

```env
AI_FAST_ENABLED=true
AI_FAST_MODEL=qwen3:1.7b
AI_FAST_TIMEOUT_SECONDS=90
AI_FAST_CONTEXT=2048
AI_FAST_NUM_PREDICT=192

AGENT_MODEL=qwen3:8b
AI_MAX_STEPS=4
AI_TIMEOUT_SECONDS=300
AI_AGENT_CONTEXT=4096
AI_AGENT_NUM_PREDICT=320

AI_THINKING=false
AI_TEMPERATURE=0
AI_KEEP_ALIVE=1h
AI_WARMUP=true
```

## 10. O que continua igual em segurança

A V2.6 não dá SQL ao modelo.

Toda escrita continua passando por:
- tools controladas;
- Zod;
- `user_id` da sessão;
- identificação/fuzzy matching no backend;
- controle de versão;
- `assistant_actions`;
- card de confirmação;
- transação SQLite;
- auditoria/histórico.

E continua **sem existir tool de criação de arranjo**.

## 11. Testes

Foram adicionados testes que validam:
- CRUD simples no modo FAST com apenas uma chamada ao modelo;
- confirmação antes de gravar;
- saudação sem nenhuma chamada ao Ollama;
- resumo financeiro FAST com uma única inferência;
- agente completo preservado;
- planejador de busca + embeddings.

A suíte desta versão passou com **16/16 testes**.
