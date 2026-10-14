# Validação da migração Ionic Angular — Sonota V2.7

## No Windows

Execute na raiz do projeto:

```powershell
cd mobile
npm install
npm run build
cd ..
npm test
.\Iniciar-Sonota.bat
```

O build Angular copia `mobile/www` para `public/ionic`, mantendo o backend Express servindo o app em `/app/`.

## O que já foi validado neste pacote

- `node --check` nos arquivos principais do backend;
- suíte de testes Node: 24/24 testes aprovados;
- varredura TypeScript sem erros próprios detectáveis fora dos módulos Angular ainda não instalados neste ambiente.

## Limitação desta geração

O ambiente usado para a migração não conseguiu baixar os pacotes Angular do npm, então `ng build` precisa ser executado no Windows. Se o compilador Angular indicar um erro de template, use a primeira mensagem/arquivo apontado para o ajuste final.

## Desktop e celular

- Desktop: esta fase ainda abre a interface pelo backend local, como o `Iniciar-Sonota.bat`. A etapa seguinte é encapsular isso em Tauri e gerar um `.exe`/instalador final.
- Android/iOS: o frontend já está estruturado para Capacitor. O backend Node + SQLite + Ollama não roda dentro do app móvel da mesma forma; o app móvel deverá se conectar a uma instância Sonota em PC/servidor (ou futuramente a um backend hospedado).
