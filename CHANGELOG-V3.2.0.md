# Sonota V3.2.0

## Biblioteca e Busca Inteligente
- O formulário de novo arranjo passa a ser sempre reiniciado, inclusive o seletor de arquivo.
- Consultas objetivas por nome, BPM, tonalidade e demais filtros são aplicadas como restrições obrigatórias antes do ranking semântico.
- Correspondências exatas exibem 100% / “Correspondência exata”.
- O botão de localização valida o arquivo e abre o Explorer selecionando o item.
- Arquivos locais passam a ser organizados em subpastas gerenciadas: arranjos, notas, projetos, laboratório, perfil e outros.

## Financeiro e documentos
- “Visualizar” abre PDF/imagem no aplicativo padrão do Windows.
- “Baixar” salva uma cópia em Downloads\Sonota e informa o caminho em um alerta de sucesso.

## Laboratório de Arranjos
- Alerta de sucesso/erro ao concluir a instalação ou reparo das dependências.
- Jobs exibem progresso aproximado e estimativa de tempo restante, refinada pelo histórico do computador.
- Saídas geradas ficam na pasta gerenciada de laboratório.

## Assistente Sonota
- Consultas como “qual projeto usa o arranjo X?” passam a usar a relação projeto ↔ arranjo diretamente no banco, sem confundir com busca de arranjos semelhantes.

## Instalador
- Interface de instalação em duas etapas: progresso do software + progresso da configuração dos recursos.
- Cache de ZIPs é validado; arquivos corrompidos são removidos e baixados novamente automaticamente.
- Mantidos Qwen3 1.7B + Qwen3 Embedding 0.6B como modelos locais.
