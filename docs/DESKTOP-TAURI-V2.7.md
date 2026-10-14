# Sonota V2.7 — Desktop real com Tauri

## Objetivo desta fase

Esta fase transforma o Sonota em um aplicativo Windows com janela própria. O usuário final deixa de abrir navegador e não precisa executar `Iniciar-Sonota.bat`.

O frontend continua sendo o mesmo Ionic Angular com HTML + CSS responsivo já testado no navegador. O Tauri funciona como a janela nativa do aplicativo. Ao abrir `Sonota.exe`, ele inicia silenciosamente o backend Node incluído no aplicativo e abre a interface Angular em uma WebView.

## Arquitetura

```text
Sonota.exe (Tauri)
        |
        +--> runtime/node.exe
        |       |
        |       +--> app/src/server.js
        |               |
        |               +--> SQLite em %LOCALAPPDATA%/Sonota/data
        |               +--> app/public/ionic (Ionic Angular)
        |               +--> Ollama http://127.0.0.1:11434
        |
        +--> janela WebView2
                |
                +--> http://127.0.0.1:31727/app/
```

## O que o usuário final NÃO precisa instalar

- Node.js global;
- npm;
- dependências npm;
- Angular CLI;
- Ionic CLI;
- Rust;
- Tauri CLI.

O instalador inclui `node.exe`, `node_modules` de produção e o frontend Angular já compilado.

## O que o instalador prepara

- Sonota Desktop;
- runtime Node.js 24 portátil;
- Microsoft Edge WebView2 quando estiver ausente;
- Ollama (opcional, marcado por padrão);
- `qwen3:1.7b`;
- `qwen3:8b`;
- `qwen3-embedding:0.6b`.

Os modelos do Ollama são grandes e são baixados durante a preparação da IA. Se essa etapa falhar por falta de internet, o Sonota continua instalado e o script `tools/install-ai.ps1` pode ser executado novamente.

## Dados do usuário

Os dados deixam de ficar dentro da pasta do programa. O Desktop define `DATA_DIR` para:

```text
%LOCALAPPDATA%\Sonota\data
```

Isso evita problemas de permissão e impede que uma atualização do programa sobrescreva o banco SQLite ou os uploads do usuário.

## Como gerar no Windows

### Pré-requisitos apenas para o desenvolvedor

1. Node.js 24;
2. Rust + Cargo (`rustup`);
3. Microsoft C++ Build Tools com Desktop development with C++;
4. WebView2 Runtime;
5. Inno Setup 6.

Depois execute:

```bat
installer\windows\Criar-Sonota-Desktop.bat
```

O script:

1. instala/atualiza dependências do Ionic Angular;
2. compila `mobile` para `public/ionic`;
3. prepara somente as dependências npm de produção do backend;
4. descobre a versão LTS mais recente do Node 24;
5. baixa o ZIP oficial e valida SHA-256;
6. inclui apenas `node.exe` no runtime final;
7. compila o launcher Tauri;
8. monta a pasta `staging`;
9. valida os arquivos obrigatórios;
10. gera `installer/windows/output/Sonota-Setup.exe`.

## Testar antes de gerar o instalador

Para criar apenas a pasta de staging e não executar o Inno Setup:

```powershell
powershell -ExecutionPolicy Bypass -File installer\windows\build-release.ps1 -SkipInstaller
```

Depois teste:

```text
installer\windows\staging\Sonota.exe
```

## Observação sobre celular

O Ionic Angular e o Capacitor continuam no projeto. O app Android/iOS será uma etapa separada. O frontend continua responsivo, mas o backend Node + Ollama local usado no Windows não deve ser empacotado no APK da mesma forma; o mobile deverá se conectar a um backend acessível pela rede ou a uma futura API hospedada.
