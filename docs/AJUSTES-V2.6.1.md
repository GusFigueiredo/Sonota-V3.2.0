# Sonota V2.6.1 AI Fast

## 1. Assistente — edição natural de clientes

Foi adicionada uma camada determinística de alta confiança antes do modelo rápido. Ela reconhece ordens simples que já contêm todos os dados necessários, evitando que o modelo 1.7B confunda uma edição com uma criação.

Exemplos aceitos:

- `adicionar o telefone: 1196969969 ao cliente Alfredo PCD`
- `coloque o WhatsApp 11999999999 no cliente Alfredo PCD`
- `adicionar o e-mail contato@empresa.com ao cliente Alfredo PCD`

Essas ordens geram `propor_editar_cliente` e continuam exigindo confirmação antes de salvar.

## 2. Assistente — criação natural de projetos

Ordens claras de criação de projeto também ganham um caminho determinístico rápido. O parser separa:

- nome do novo projeto;
- cliente;
- arranjo;
- valor opcional;
- status opcional.

Exemplo:

`criar um projeto chamado musica pokemon, para o cliente alfredo pcc com o arranjo pokemon custando 10 reais`

O backend continua resolvendo cliente e arranjo com busca aproximada e validação. Assim, um pequeno erro como `alfredo pcc` pode localizar `Alfredo PCD` sem o modelo inventar IDs.

Também foram substituídos erros genéricos de criação de projeto por mensagens específicas quando o nome do projeto ou o cliente realmente não forem informados.

## 3. Ollama continua sendo usado

A camada determinística não substitui a IA. Ela só intercepta ordens simples e inequívocas para aumentar velocidade e confiabilidade. Frases não reconhecidas continuam indo para `qwen3:1.7b`, e pedidos complexos continuam podendo seguir para o agente maior.

## 4. Busca Inteligente — Localização

Cada resultado de arranjo da página Busca Inteligente agora possui:

- **Baixar**;
- **Localização**.

No navegador, Localização exibe a mesma explicação usada na Biblioteca, pois uma página web não pode abrir diretamente o Explorer do Windows. A ação fica pronta para integração desktop futura.

## 5. Arquivos principais alterados

- `src/ai/fast.js` — parser determinístico, exemplos adicionais e Fast Mode.
- `src/ai/tools.js` — mensagens específicas para criação de projeto.
- `mobile/src/pages/SearchPage.jsx` — botão Localização.
- `mobile/src/theme.css` — layout das ações do resultado.
- `tests/ai-agent.test.js` — testes dos dois bugs relatados.
