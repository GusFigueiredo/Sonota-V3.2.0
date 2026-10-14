# Sonota V3.0.4

## Experiência de navegação
- A antiga página **Início** passa a se chamar **Dashboard**, preservando os indicadores, gráficos, pendências, entregas e atividades existentes.
- Foi criada uma nova página **Início**, mais simples e operacional.
- O card de boas-vindas da versão anterior foi mantido sem alteração de conteúdo.
- A nova página Início mostra somente **Projetos recentes** e **Ferramentas**, evitando excesso de informação.

## Biblioteca + Busca Inteligente
- A página separada **Busca Inteligente** foi removida da navegação.
- A busca inteligente agora faz parte da própria **Biblioteca**.
- O antigo card grande de filtros foi substituído por uma barra de busca compacta em linguagem natural.
- A busca continua usando o motor híbrido local já existente (metadados, FTS5, embeddings e Qwen quando necessário) para ranquear arranjos cadastrados e seus arquivos locais.
- Filtros tradicionais de BPM, tonalidade, gênero, instrumento e tag continuam disponíveis de forma recolhível.
- Resultados inteligentes usam os mesmos cards e ações da Biblioteca: ouvir, baixar, editar, localizar e excluir.

## Alertas
- Os toasts/alerts do Sonota foram movidos do canto inferior direito para o canto superior esquerdo da área útil do aplicativo.
- Quando há vários alertas, eles continuam empilhados verticalmente, agora de cima para baixo.
- O posicionamento acompanha o estado aberto/recolhido da barra lateral e possui ajuste responsivo para telas menores.

## Compatibilidade
- Nenhuma mudança foi feita no formato do banco de dados.
- O instalador portátil, Node, Python, FFmpeg, Ollama e Laboratório continuam usando a arquitetura da V3.0.3.
## Correção integrada

- Removido o card de boas-vindas da página Dashboard.
- O card de boas-vindas permanece somente na página Início.
- Mantidos os alerts/toasts no canto superior direito e o nome do usuário em laranja e negrito na página Início.

