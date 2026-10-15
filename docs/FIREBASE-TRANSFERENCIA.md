# Integração Firebase transferida para Sonota V3.2.0

Origem: SonotaApp. A transferência preserva a interface Angular, as rotas de IA,
a busca FTS, o laboratório e as migrações existentes desta versão.

- Cadastro e senha: Firebase Authentication (sem fallback para senha local).
- Perfil: Firestore, coleção usuarios/{uid}. Nenhum novo perfil/sessão no SQLite.
- Cookie de sessão emitido pelo Firebase e validado com revogação.
- Clientes, projetos, arquivos e mensagens da IA continuam locais.
- owners guarda apenas os identificadores de propriedade. Dados antigos não são apagados.
- Contas exclusivamente locais precisam de migração administrativa; não são
  associadas automaticamente a um Firebase pelo e-mail.
- Alterações de perfil pela IA usam Firestore. Confirme-as separadamente de operações
  em clientes/projetos para não prometer uma transação atômica entre dois bancos.
- Recuperação de senha usa Firebase; alteração de e-mail ainda não é oferecida pelo backend.

## Migrações

006_firebase_auth.sql acrescenta a referência histórica Firebase.
007_file_pins.sql preserva arquivos de foto referenciados pelo perfil remoto.
008_cloud_owners (migração JS) troca as referências a users por owners,
inclusive na tabela ai_messages. Valida chaves estrangeiras antes do commit.
As migrações já foram aplicadas ao banco real, após backup completo.
Contagens de usuários, sessões, clientes, projetos, arquivos e mensagens da IA
foram preservadas. integrity_check e foreign_key_check passaram.

## Configuração

No .env, configure FIREBASE_PROJECT_ID e GOOGLE_APPLICATION_CREDENTIALS.
O arquivo administrativo deve ficar fora do repositório.
A configuração Web está em mobile/src/app/firebase.ts.
Não publique o .env ou o JSON administrativo. .env.example contém apenas exemplos.

## Executar

npm.cmd start
npm.cmd run ui:dev

Backend: http://localhost:3000/app/
Desenvolvimento Angular: http://localhost:8100 (proxy /api para porta 3000).

## Validar

npm.cmd test
npm.cmd run check
npm.cmd run ui:build
node --env-file=.env scripts/validar-login-firebase.js

O último comando usa uma conta Firebase descartável e um banco temporário; remove
a conta e o perfil no final. Não envia e-mail nem utiliza contas pessoais.
Não interrompa o processo durante a limpeza.

No navegador: cadastrar, conferir Authentication e Firestore, salvar perfil,
trocar senha, sair, entrar novamente e testar o isolamento entre duas contas.
O build continua usando o pipeline Angular próprio desta versão; nenhum pacote
visual compilado do SonotaApp foi copiado.

## Resultado desta transferência

- 17 testes selecionados de API, persistência, backup, migração e Firebase passaram.
- Build Angular e teste real de login/perfil/troca de senha Firebase passaram.
- A conta remota temporária foi removida ao terminar.
- A suíte completa ficou presa em ai-agent.test.js (Ollama); não foi declarada validada.
- npm reportou 21 vulnerabilidades nas dependências do mobile. Não foi executado audit fix --force para não alterar versões fora do escopo.
- Backup completo: backups/sonota-2026-10-15T00-02-45-986Z.
- Backup dos arquivos anteriores: backups/firebase-transfer-2026-10-14T23-57-20-218Z.

A credencial privada não foi copiada: o .env aponta para o arquivo seguro já existente.
O teste no navegador com sua conta ainda é necessário para conferir a interação visual.
