# Sonota V3.0.1

## Correção do build do instalador

O erro `os error 112 / no space on device` era falta de espaço no disco durante a compilação Rust/Tauri. O build agora:

1. limpa `desktop/src-tauri/target` de builds antigos;
2. verifica espaço livre antes de iniciar;
3. compila o Tauri antes de baixar/duplicar os pré-requisitos pesados;
4. usa um `CARGO_TARGET_DIR` temporário isolado;
5. desativa incremental do Cargo na release;
6. remove os artefatos Rust após copiar `Sonota.exe`;
7. mostra uma mensagem clara caso o espaço livre continue insuficiente.

Recomendado: manter pelo menos **12 GB livres** no disco do projeto. O build interrompe cedo com menos de 8 GB.

## Feedback visual

Foi adicionado um sistema global de alerts/toasts para sucesso, informação, aviso e erro. As mensagens incluem cadastro/edição/exclusão de clientes, projetos e arranjos, financeiro, versões, documentos, perfil, ações da IA e jobs do Laboratório.

O processamento de áudio passa a gerar aviso de início e também um aviso automático ao concluir/falhar, incluindo o nome do arranjo.
