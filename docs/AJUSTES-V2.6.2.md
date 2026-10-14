# Sonota V2.6.2 — Ações administrativas instantâneas

## Objetivo

A V2.6.2 reduz o tempo do Assistente em operações que não precisam de interpretação avançada. Quando a intenção pode ser identificada com alta confiança pelo próprio backend, o Sonota não chama `qwen3:1.7b` nem `qwen3:8b`.

## Arquivo principal alterado

`src/ai/fast.js`

Procure pelos comentários `// # Ações administrativas instantâneas` e `// # Prioridade 1`.

## Fluxo novo

```text
mensagem
  ↓
parser determinístico
  ├─ reconheceu com alta confiança → tool do Sonota → card de confirmação
  └─ não reconheceu → qwen3:1.7b → se necessário qwen3:8b
```

O parser não grava nada diretamente. Ele apenas escolhe a mesma `propor_*` usada pelo agente e o usuário continua precisando confirmar.

## Exclusões instantâneas

Agora são reconhecidas localmente variações de:

- excluir / apagar / remover / deletar cliente;
- excluir / apagar / remover / deletar projeto;
- excluir / apagar / remover / deletar arranjo.

Exemplos:

```text
excluir o cliente Alfredo PCD
apaga o projeto Campanha Aurora
remove o arranjo Pokemon
```

A localização do registro continua usando `resolveRecord()` e fuzzy matching controlado. Se houver mais de uma opção parecida, o Sonota recusa a escolha automática e mostra os candidatos.

## Mudança de etapa instantânea

São reconhecidos os estados:

- Proposta;
- Em produção;
- Revisão;
- Concluído;
- Cancelado.

Também são aceitos sinônimos simples, por exemplo:

```text
muda Campanha Aurora para concluído
coloca Campanha Aurora como revisão
passa Campanha Aurora para produção
finaliza o projeto Campanha Aurora
termina Campanha Aurora
cancela o projeto Campanha Aurora
```

`finalizar`, `terminar` e `encerrar` são normalizados para `Concluído`.

A confirmação continua chamando o fluxo normal de `updateEntity`, portanto histórico, Dashboard e integrações existentes continuam sendo atualizados pelas regras do projeto.

## Pagamento instantâneo

Pedidos claros como:

```text
marca o pagamento do projeto Campanha Aurora como recebido
coloca Campanha Aurora como pago
muda o pagamento de Campanha Aurora para pendente
```

podem gerar a proposta sem LLM.

## Segurança

A V2.6.2 não transforma esses comandos em SQL.

O fluxo continua:

```text
parser local
  ↓
tool controlada (`propor_*`)
  ↓
validação + localização segura
  ↓
assistant_actions
  ↓
card de confirmação
  ↓
backend
  ↓
SQLite
```

Exclusões e mudanças de status ainda não são executadas antes do clique em Confirmar.

## Testes

Foram adicionados testes para:

- exclusão determinística de cliente;
- exclusão determinística de projeto;
- exclusão determinística de arranjo;
- mudança para Concluído;
- comandos `finaliza` e `cancela`;
- marcar pagamento como recebido.

Os testes usam um endereço de Ollama inválido de propósito. Se a operação ainda funciona em modo `fast` com `model = local-fast-parser`, isso comprova que nenhuma inferência foi necessária.
