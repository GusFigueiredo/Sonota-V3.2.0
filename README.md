# Sonota V3.2.0 — Ionic Angular + Desktop Tauri

Esta edição usa **Ionic Angular** no frontend, com as páginas mantidas em **HTML + CSS responsivo** e TypeScript apenas para a lógica. O backend continua em Node.js/Express com SQLite, armazenamento privado de arquivos e integração local com Ollama.

A V3.2.0 mantém o instalador independente do Windows: Node 24, Python 3.10 e Ollama são usados em modo portátil dentro do Sonota, além de FFmpeg empacotado, modelos Qwen e validação real do Laboratório antes de concluir o Setup. Os alerts/toasts da V3.0.1 foram mantidos.

## Primeiro uso após git clone

Requer **Node.js 24 LTS**, npm (incluído no Node), Git e internet. Execute na raiz do repositório:

```powershell
npm.cmd run setup
```

No Linux/macOS, use `npm` no lugar de `npm.cmd`. O setup cria `.env` sem sobrescrever um existente, instala as dependências da raiz e do mobile com os lockfiles e compila a interface para `public/ionic/`. Não precisa instalar Ionic globalmente para rodar o aplicativo.

### Configurar Firebase nesta máquina

O login usa Firebase Authentication e os perfis usam Firestore. A configuração pública Web está em `mobile/src/app/firebase.ts` e deve ser versionada. A chave administrativa privada **não é esse firebaseConfig** e não deve ser commitada.

1. Peça ao responsável pelo projeto uma credencial administrativa por um canal privado, ou gere uma no console Firebase em **Configurações do projeto → Contas de serviço → Gerar nova chave privada**, se tiver permissão.
2. Crie a pasta `.secrets` na raiz e salve o JSON como `.secrets/firebase-admin.json`. Essa pasta está no `.gitignore`.
3. Confira no `.env`: `GOOGLE_APPLICATION_CREDENTIALS=./.secrets/firebase-admin.json` e `FIREBASE_PROJECT_ID=bancodosonotaapp`. Pode usar outro caminho privado disponível na nova máquina.
4. Ao usar outro projeto Firebase, atualize também o objeto público em `mobile/src/app/firebase.ts`, habilite Authentication por e-mail/senha e crie o Firestore. Confira `localhost` nos domínios autorizados do Authentication. Execute `npm.cmd run ui:build` após alterar a configuração Web.
5. Execute `npm.cmd run doctor`. Ele verifica os arquivos e a correspondência de projeto sem imprimir segredos. A validação é local; teste o login para confirmar acesso remoto.

Não basta copiar o caminho absoluto do computador anterior: o arquivo privado precisa existir nesta máquina. Sem uma credencial autorizada o servidor não consegue concluir o login Firebase.

### Iniciar e testar

```powershell
npm.cmd start
```

Abra **http://localhost:3000/app/**. Teste cadastro, sair, entrar, editar perfil e atualizar a página. Confirme o usuário em Authentication e o perfil na coleção `usuarios` do Firestore.

Para desenvolver com atualização automática, mantenha o backend aberto e, em outro terminal na raiz, execute `npm.cmd run ui:dev`. Abra **http://localhost:8100**. Se preferir `ionic serve`, instale o CLI com `npm.cmd install -g @ionic/cli`, entre na pasta `mobile` e execute `ionic serve`.

A IA fica desabilitada no modelo inicial para dispensar Ollama no primeiro uso. Para habilitar, instale Ollama e os modelos indicados no `.env.example`, depois configure `AI_ENABLED=true`. O processamento de áudio exige os componentes descritos em `audio/README.md`.

### O que enviar ao GitHub

Inclua todos os arquivos de código, migrations, `.env.example`, `.gitignore`, `.nvmrc`, os dois `package.json` e os dois `package-lock.json`, além dos novos scripts e configuração pública Firebase. Confira `git status` antes do commit: arquivos novos precisam entrar no commit também.

Não envie `.env`, `.secrets/`, credenciais privadas, `node_modules/`, `data/` ou backups. Esses arquivos são locais. O banco SQLite é criado/migrado automaticamente ao iniciar. Contas e perfis Firebase são compartilhados entre máquinas que usam o mesmo projeto; clientes, projetos e arquivos locais **não são transferidos pelo git clone**. Para levar esses dados, use backup e restauração separados.

## Rodar durante o desenvolvimento

No Windows, o fluxo legado continua disponível por `Iniciar-Sonota.bat`. Para compilar apenas a interface Angular:

```powershell
cd mobile
npm install
npm run build
```

O `postbuild` copia a interface para `public/ionic/`, de onde o backend a serve em `/app/`.

## Gerar o aplicativo/instalador Windows

Na raiz do projeto:

```powershell
.\installer\windows\Criar-Sonota-Desktop.bat
```

O processo compila Angular + Tauri, prepara o backend e inclui Node 24, Python 3.10 portátil, FFmpeg, Ollama portátil e o bootstrapper do WebView2. O `Sonota-Setup.exe` só conclui após validar IA e Laboratório. Os dois modelos Qwen e os pacotes Python ainda exigem internet durante a primeira instalação.

## Estrutura

- `mobile/`: Ionic Angular, templates HTML, CSS responsivo e TypeScript.
- `desktop/`: shell Tauri do aplicativo Windows.
- `src/`: backend Express, autenticação, arquivos, jobs, busca e assistente.
- `public/ionic/`: build Angular servido pelo backend.
- `public/`: frontend legado preservado como fallback.
- `audio/`: worker Python de Stems, MIDI e Partitura.
- `installer/windows/`: scripts para montar o instalador Windows.
- `data/`: banco e armazenamento durante desenvolvimento.

## Feedback visual V3.0.1

As operações importantes agora exibem alerts/toasts não bloqueantes no canto da interface. Exemplos:

- **Cliente cadastrado com sucesso** / cliente editado / excluído;
- **Projeto cadastrado com sucesso** / etapa atualizada;
- **Arranjo cadastrado com sucesso** / **Arranjo editado com sucesso**;
- atualização do financeiro, documentos, versões e perfil;
- início de Stems/MIDI/Partitura;
- **Separação de stems concluída** com o nome do arranjo;
- conclusão de MIDI/Partitura e falhas de processamento;
- IA local pronta após um reparo.

Erros que antes abriam `window.alert()` também passam pelo mesmo sistema visual, sem travar a interface. O AppComponent monitora jobs ativos para informar a conclusão do processamento mesmo que o usuário navegue para outra página.

## Principais funcionalidades desta versão

### Login e conta

- cadastro, login e logout;
- isolamento de clientes, projetos, arranjos, arquivos e financeiro por conta;
- edição de nome, empresa, cargo, e-mail e telefone;
- confirmação por senha para alteração do e-mail;
- troca de senha;
- foto de perfil PNG/JPG;
- preferências de alertas armazenadas por usuário;
- exportação dos dados da conta, incluindo histórico e versões dos projetos.

### Dashboard com dados reais

- boas-vindas personalizadas;
- arranjos no acervo, clientes ativos, projetos em andamento e valor já recebido;
- Fluxo de estúdio dos últimos seis meses;
- gráfico com quantidade de projetos criados por mês e tooltip com o valor recebido no mesmo período;
- alertas automáticos de atraso, prazo próximo, protótipo sem envio, pagamento, nota fiscal, arranjo ausente e revisão;
- próximas entregas em ordem cronológica;
- atividades recentes geradas pelo histórico dos projetos;
- clique em alertas, entregas e atividades para abrir o projeto relacionado.

### Clientes

- CRUD completo e busca;
- CPF/CNPJ, empresa, e-mail, telefone, WhatsApp, cidade, status e observações;
- clique no card para abrir detalhes;
- resumo com projetos, ativos, contratado, recebido, pendente e arranjos usados;
- bloqueio de exclusão quando houver projeto vinculado.

### Projetos

- nome, descrição, cliente, arranjo, prazo, valor, proposta/briefing, objetivo, referências, estilo e instrumentos;
- cards principais sem repetir status;
- Kanban: Proposta, Em produção, Revisão, Concluído e Cancelado;
- drag-and-drop no computador;
- confirmação ao mover para Concluído ou Cancelado;
- alteração de etapa atualiza automaticamente histórico, Dashboard e Financeiro;
- ao concluir, o valor já aparece como “A receber” sem novo cadastro;
- reabrir o projeto não apaga pagamento ou documento financeiro;
- exclusão com confirmação.

### Workspace do projeto

Cada projeto ganhou uma área própria com:

- proposta e informações musicais;
- cliente e contato;
- resumo financeiro;
- versões/protótipos numerados automaticamente;
- status de versão: Protótipo, Revisão, Aprovado e Master;
- edição e exclusão de versões;
- player e download;
- envio/compartilhamento de protótipo;
- histórico cronológico;
- notas fiscais e anexos.

No celular, o botão **Compartilhar** usa o compartilhamento nativo quando o navegador/sistema aceita compartilhamento de arquivos. O botão WhatsApp prepara a mensagem e abre a conversa. Sem a API oficial do WhatsApp, o Sonota não afirma que uma mensagem foi enviada automaticamente: existe uma ação explícita para marcar a versão como enviada.

### Laboratório de Arranjos

A antiga página **Arranjos** passou a ser o **Laboratório de Arranjos**. O cadastro técnico fica centralizado na Biblioteca, enquanto o laboratório concentra processamento musical por IA:

- seção **Separação de Stems**, selecionando um arquivo da Biblioteca e gerando um ZIP com vocals, drums, bass e other via Demucs;
- seção **Transcrição**, escolhendo MIDI (`.mid`) ou Partitura (`.musicxml`);
- preview do áudio de origem;
- histórico dos processamentos;
- estados de fila/processamento/conclusão/erro;
- download das saídas geradas;
- atualização automática do histórico enquanto houver processamento ativo.

### Biblioteca

- cadastro de um novo arranjo diretamente pela Biblioteca;
- edição dos metadados e substituição opcional do arquivo;
- filtro por texto/nome, BPM, tonalidade, gênero, instrumento e tag;
- player;
- download;
- botões **Baixar**, **Editar**, **Localização** e **Excluir** em todos os cards.

No aplicativo desktop, o botão **Localização** usa o backend para abrir o Explorer diretamente no arquivo gerenciado pelo Sonota.

### Busca inteligente

- linguagem natural;
- busca por BPM, tonalidade, gênero, instrumentos, tags e contexto do projeto;
- tolerância textual e sinônimos existentes no motor de busca;
- embeddings opcionais via Ollama;
- resultados mostram arranjos e projetos relacionados.

### Financeiro e notas fiscais

- utiliza o valor cadastrado no próprio projeto;
- estados derivados: Previsto, A receber, Recebido e Atrasado;
- vencimento de pagamento;
- marcar recebido/pendente;
- adicionar ou substituir documentos;
- visualizar, baixar e excluir PDF/PNG/JPG/XML;
- cards de documentos na ordem Projeto → descrição → arquivo;
- recebimentos alimentam o Dashboard e o Fluxo de estúdio pelo mês real do recebimento.

### Assistente Sonota

O chat flutuante entende pequenas variações e erros de escrita e agora pode:

- listar projetos e filtrar por etapa;
- responder quanto há a receber;
- informar a próxima entrega;
- procurar arranjos por faixa/aproximação de BPM;
- localizar a última versão de um projeto;
- criar uma proposta de novo projeto a partir de cliente/arranjo/valor identificados;
- alterar status, pagamento, valor, prazo, dados do cliente, BPM e tonalidade;
- abrir páginas da aplicação.

Ações de alteração/criação são apresentadas para revisão e **só são salvas após confirmação**.

## Capacitor / Android / iOS

O diretório `mobile/` já contém `capacitor.config.json` e dependências Android/iOS.

Depois de instalar as dependências:

```powershell
cd mobile
npm run cap:add:android
npm run cap:android
```

Para iOS, a etapa nativa precisa ser feita em macOS com Xcode:

```bash
npm run cap:add:ios
npm run cap:ios
```

Para usar o app nativo contra um backend em outro computador/servidor, configure `VITE_API_URL` em `mobile/.env` e ajuste `HOST`, `APP_ORIGINS` e HTTPS do backend. Em produção, a API deve estar publicada em uma origem segura e acessível pelo aparelho.

## Processamento de áudio

A gestão completa funciona sem modelo de IA. Stems/MIDI/partitura/análise dependem das ferramentas descritas em `audio/README.md`. O projeto não inclui pesos de modelos de terceiros.

## Dados

Por padrão:

- `data/sonota.sqlite`: banco;
- `data/uploads/`: arquivos privados;
- `data/jobs/`: temporários de processamento.

Use `npm run backup` com o servidor parado para backup completo.

## Validação desta edição

Nesta edição foram verificados localmente:

- `node --check` nos arquivos Node alterados;
- compilação sintática do worker Python;
- **24/24 testes automatizados do backend aprovados**;
- transpilação sintática dos arquivos TypeScript alterados do Angular.

O build Angular/Tauri e a instalação das dependências pesadas de áudio precisam ser executados no Windows de desenvolvimento, pois este ambiente não possui a cadeia Windows/Rust completa e o registro npm não ficou disponível para um novo `npm install`.

## Limites que continuam externos ao protótipo

- recuperação de senha por e-mail exige um provedor de e-mail e fluxo de tokens;
- notificações push exigem configuração Firebase/APNs;
- envio automático com confirmação real de entrega pelo WhatsApp exige WhatsApp Business/Cloud API;
- emissão de NFS-e depende da prefeitura/provedor fiscal e credenciais;
- “Mostrar na pasta” é recurso de desktop nativo, não de navegador/mobile;
- publicação em lojas exige assinatura, ícones/splash, políticas, HTTPS e infraestrutura de backend pública.

Esses itens foram deixados explícitos em vez de serem simulados como se estivessem funcionando.


## Ajustes V2.1
- Identidade visual reaproximada do CSS do Sonota V6 (tema escuro, gradientes laranja/vermelho, cards e menu).
- Login centralizado e sem card de marca separado.
- Menu burger em overlay, com Perfil somente no rodapé.
- Assistente Sonota flutuante redimensionado para caber na viewport.
- Correção do gráfico Fluxo de estúdio.
- Correção de edição de clientes/projetos/arranjos sem reenvio de campos internos.
- Campo de valor de projeto aceita formato brasileiro.
- Mensagens de validação detalhadas e alertas nos cadastros.
- Upload de arranjos passa a aceitar FLAC também no backend.


## Ajustes V2.2
- Shell principal refeito em JSX/HTML com a estrutura visual do Sonota V6; Ionic deixa de definir a aparência da sidebar e da topbar.
- Menu recolhido permanece visível como uma barra lateral de ícones.
- Ícones padronizados em SVG de traço único e espaçamento uniforme entre ícone e rótulo.
- Perfil continua somente no rodapé da sidebar.
- Biblioteca passa a concentrar cadastro e edição de arranjos, além de Download, Editar e Localização por card.
- Página Arranjos renomeada para Laboratório de Arranjos.
- Laboratório dividido em Separação de Stems e Transcrição MIDI/Partitura.
- CSS do Sonota V6 permanece como base visual e componentes Ionic recebem apenas adaptações para não trazer a aparência padrão do framework.

## Atualização V2.3

Esta versão concentra os ajustes visuais e de usabilidade solicitados após a V2.2:

- a rolagem acontece dentro da área principal da aplicação, mantendo a sidebar/botão burger e o Assistente Sonota fixos na viewport;
- o botão `desktop-menu-toggle` foi removido do header; o menu é aberto/recolhido somente pela marca no topo da sidebar;
- o Dashboard passou a usar um único hero de boas-vindas inspirado no protótipo HTML/CSS Sonota V6, com ondas de áudio animadas;
- todos os campos de texto, número, data, seleção e textarea foram padronizados com controles HTML nativos e a mesma identidade do campo de pesquisa de Clientes, eliminando a aparência padrão de inputs Ionic;
- o cadastro/edição de arranjos agora oferece sugestões de tonalidade, gênero, instrumentos e tags, sem impedir digitação livre;
- a Busca Inteligente foi redesenhada como uma conversa com IA, com sugestões de consultas e os principais resultados exibidos abaixo do chat.

### Observação sobre os controles

React e Ionic continuam responsáveis pela lógica e infraestrutura, mas os campos visuais usam HTML nativo (`input`, `select` e `textarea`) estilizado pelo CSS do Sonota. Isso evita diferenças visuais introduzidas pelos Web Components de formulário do Ionic.

## Atualização V2.4

- botões de ação dos cards de **Clientes** e **Projetos** agora usam o mesmo padrão visual `ghost-btn + icon-action` da Biblioteca, com ícones uniformes;
- cards de arranjos da Biblioteca receberam a ação **Excluir**, com confirmação;
- os quatro cards de métricas do Dashboard foram redesenhados a partir da referência `Cards Metrics.png`: ícone em caixa com borda, rótulo, valor em destaque e legenda operacional;
- a marca da sidebar usa os assets oficiais enviados: quando recolhida mostra `sonota-logo-icon.png`; quando expandida mostra `sonota-logo-name.png`, sem `span.brand-text`;
- o **Fluxo de estúdio** agora usa a altura das barras para representar a quantidade de projetos criados em cada mês; ao passar o mouse, um tooltip mostra quantidade criada e valor efetivamente recebido no mês;
- botões de cadastro agora usam os textos `+ Cadastrar novo cliente`, `+ Cadastrar novo projeto` e `+ Cadastrar novo arranjo`;
- **Estilo musical** em Projetos agora é um `select` HTML nativo como o campo Etapa;
- Tonalidade e Gênero no cadastro de arranjos usam `select` HTML nativo e mantêm `Outro / personalizado` para entrada manual;
- o chat da Busca Inteligente ficou mais alto para dar mais espaço à conversa.

---

## Sonota AI Local — agente real com Ollama

Esta versão adiciona uma arquitetura de IA local sem API paga. O Assistente deixa de depender apenas de regex e passa a usar **tool calling** com um modelo Qwen3 executado pelo Ollama.

### Configuração rápida

Na V3.1.0 existem apenas dois modelos obrigatórios: `qwen3:1.7b`, usado tanto no modo FAST quanto no agente com tools, e `qwen3-embedding:0.6b`, usado na busca semântica. O antigo `qwen3:8b` deixou de ser requisito, reduzindo vários GB de download/armazenamento e evitando que uma falha nesse modelo bloqueie a instalação.


1. Instale o Ollama.
2. Execute `Configurar-IA-Sonota.bat`.
3. Depois execute `Iniciar-Sonota.bat`.

Modelos padrão:

- `qwen3:1.7b` — parser assistido/FAST e agente completo com tools;
- `qwen3-embedding:0.6b` — Busca Inteligente semântica.

### Assistente

Antes de chamar qualquer modelo, a V2.6.2 tenta reconhecer ações administrativas de alta confiança localmente. Exemplos:

- `excluir o cliente Alfredo PCD`;
- `apagar o projeto Campanha Aurora`;
- `remover o arranjo Pokemon`;
- `mudar Campanha Aurora para concluído`;
- `finalizar o projeto Campanha Aurora`;
- `cancelar Campanha Aurora`;
- `marcar o pagamento do projeto Campanha Aurora como recebido`.

Essas frases geram o card de confirmação sem inferência do Ollama. Se a frase não encaixar com segurança nesses padrões, o Sonota segue para o modo FAST e, se necessário, para o agente com tools — ambos usando `qwen3:1.7b`.

O agente pode consultar e propor criações, alterações e exclusões nas áreas operacionais do Sonota. Escritas continuam exigindo confirmação antes de chegar ao SQLite. É possível preparar várias ações na mesma frase, inclusive criar um cliente e depois um projeto relacionado a ele.

**Regra de produto:** o Assistente não cadastra novos arranjos. O cadastro continua na Biblioteca porque depende do arquivo de áudio. O agente pode consultar, editar e excluir arranjos já existentes dentro das regras do sistema.

### Desempenho da IA na V3.2.0

- contexto FAST reduzido para 1536 tokens e respostas estruturadas menores;
- agente limitado a 3 etapas, 4 mensagens de memória e 192 tokens de saída;
- seleção de tools por área para não enviar schemas desnecessários ao modelo;
- warm-up do modelo de conversa e dos embeddings;
- embeddings dos arranjos pré-calculados em segundo plano;
- índice FTS5 mantido de forma incremental, sem reconstruir a Biblioteca inteira em toda busca.

### Busca Inteligente

A busca agora pode combinar:

1. Qwen3 como planejador da frase;
2. filtros exatos do banco (BPM, tonalidade etc.);
3. FTS5 para texto;
4. Qwen3 Embedding para significado;
5. contexto de projetos/clientes ligados ao arranjo.

Se o Ollama não estiver disponível, o projeto mantém os motores anteriores como fallback.

Veja `docs/IA-LOCAL-SONOTA.md` para o mapa completo dos arquivos e blocos `// #` comentados.

---

## Sonota Desktop (Tauri) — Fase 2

A pasta `desktop/` contém o launcher Tauri para Windows. O aplicativo inicia o backend Node de forma invisível e abre o mesmo frontend Ionic Angular/HTML/CSS em uma janela própria.

Para gerar o instalador final no Windows, execute:

```bat
installer\windows\Criar-Sonota-Desktop.bat
```

Consulte `docs/DESKTOP-TAURI-V2.7.md` para arquitetura, pré-requisitos de desenvolvimento e detalhes do instalador.

## Fase 2.4 — correções desktop e áudio

- **Biblioteca / Localização:** o botão agora solicita ao backend local que abra o Explorer e selecione o arquivo armazenado pelo Sonota. O card informativo antigo foi removido.
- **Laboratório de Arranjos:** o instalador ganhou uma tarefa opcional (marcada por padrão) que prepara Python 3.10, FFmpeg, PyTorch CPU compatível com Demucs 4, Basic Pitch via ONNX, music21 e librosa para Stems, MIDI e Partitura.
- **Projetos / Kanban:** o arrastar e soltar agora possui dois caminhos: HTML5 Drag & Drop e fallback por Pointer Events para WebView2/Tauri, com feedback visual e prevenção de clique acidental após o drag.
- **Arquivos da Biblioteca:** o áudio atual passa a ser armazenado com o nome cadastrado no Sonota. Versões anteriores recebem sufixo `- vN`; arquivos antigos salvos como UUID são renomeados automaticamente ao abrir a Biblioteca.
- **Laboratório:** a instalação de áudio agora valida as dependências, executa um autoteste MIDI, registra diagnóstico e prepara o modelo do Demucs quando possível.

Para aplicar as mudanças na versão instalada, gere um novo `Sonota-Setup.exe` executando `installer\windows\Criar-Sonota-Desktop.bat` e reinstale/atualize o Sonota.


## Fase 2.5
- Laboratório não é mais bloqueado pelo resultado do autoteste sintético; se o Python de áudio existe, o backend detecta Demucs/Basic Pitch/music21 diretamente.
- Botão de reparo dos recursos de áudio dentro do Laboratório (Desktop).
- Kanban refeito com Pointer Events, sem depender do HTML5 drag/drop do WebView2.
- Arquivos de arranjos continuam usando o título cadastrado como nome físico gerenciado.


## Fase 2.7 - correção definitiva do instalador de áudio
O build agora valida um marcador interno do script de áudio e interrompe caso tente empacotar uma versão antiga. O instalador de áudio foi refeito sem capturar logs como retorno de função, recria o venv do zero e valida MIDI, Partitura e Stems antes de habilitar o Laboratório.
