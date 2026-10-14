# Sonota V2.7 - Migracao para Ionic Angular

## Objetivo desta entrega

A interface principal foi migrada de Ionic React para Ionic Angular, mantendo o desenho atual baseado em HTML + CSS responsivo.

- HTML nativo continua sendo a estrutura visual.
- `sonota-v6.css` e `theme.css` continuam definindo a identidade preto + laranja e a responsividade.
- Angular/TypeScript cuida de estado, eventos, formulários e chamadas para a API.
- Ionic fornece a infraestrutura de app; os templates nao dependem de `ion-card`, `ion-input` ou `ion-button` para o visual.
- Capacitor continua preparado para Android/iOS.

## Estrutura nova

`mobile/src/app/app.component.html` contem o shell principal.

Cada pagina possui arquivos separados `.ts` e `.html`:

- Login
- Dashboard
- Clientes
- Projetos
- Workspace do projeto
- Laboratorio de Arranjos
- Biblioteca
- Busca Inteligente
- Financeiro
- Perfil
- Assistente Sonota

## Build

```powershell
cd mobile
npm install
npm run build
```

O Angular gera `mobile/www` e o `postbuild` copia automaticamente o resultado para `public/ionic`, que ja e servido pelo backend em `/app/`.

## Sonota.bat

O `Iniciar-Sonota.bat` foi atualizado para detectar `@ionic/angular`, instalar dependencias quando necessario e compilar o Angular antes de iniciar o backend.

## React

A pasta `mobile` nao depende mais de React. A copia antiga foi removida desta entrega para reduzir o tamanho. O ZIP V2.7 original continua sendo a referencia de rollback.
