import { ollamaChat } from './ollama.js';
import { createToolRuntime } from './tools.js';
import { saveAssistantProposal } from './actions.js';
import { saveAiMessage } from './memory.js';

// # Fast Action Mode
// Para CRUD simples e consultas diretas, o Sonota NÃO abre um loop de agente.
// Um modelo menor transforma a frase em uma ou mais chamadas estruturadas e o backend
// executa/valida tudo. Escritas continuam virando proposta e só salvam após confirmação.

const FAST_TOOLS=[
  'buscar_clientes','obter_cliente','buscar_projetos','obter_projeto','buscar_arranjos','obter_arranjo','resumo_financeiro','listar_prazos','listar_alertas','listar_versoes_projeto','listar_historico_projeto','listar_documentos','listar_processamentos_audio','obter_perfil','abrir_pagina',
  'propor_criar_cliente','propor_criar_projeto','propor_editar_cliente','propor_editar_projeto','propor_atualizar_pagamento','propor_editar_arranjo','propor_editar_versao','propor_marcar_versao_enviada','propor_editar_perfil',
  'propor_excluir_cliente','propor_excluir_projeto','propor_excluir_arranjo','propor_excluir_versao','propor_excluir_documento','propor_iniciar_processamento_audio','propor_cancelar_processamento_audio','propor_excluir_processamento_audio'
];

const stringOrNull={anyOf:[{type:'string'},{type:'null'}]};
const numberOrNull={anyOf:[{type:'number'},{type:'null'}]};
const boolOrNull={anyOf:[{type:'boolean'},{type:'null'}]};
const arrayOfStrings={type:'array',items:{type:'string'}};

// # Schema único e compacto
// Em vez de enviar dezenas de schemas de tools para o modelo pequeno, usamos um formato
// universal. Isso reduz tokens de entrada e deixa a inferência muito mais rápida.
const fastFormat={
  type:'object',additionalProperties:false,
  properties:{
    mode:{type:'string',enum:['fast','agent']},
    calls:{type:'array',maxItems:6,items:{
      type:'object',additionalProperties:false,
      properties:{
        tool:{type:'string',enum:FAST_TOOLS},
        args:{type:'object',additionalProperties:false,properties:{
          consulta:stringOrNull,status:stringOrNull,cliente:stringOrNull,projeto:stringOrNull,arranjo:stringOrNull,versao:stringOrNull,documento:stringOrNull,processamento:stringOrNull,pagina:stringOrNull,
          nome:stringOrNull,tipo:stringOrNull,empresa:stringOrNull,email:stringOrNull,telefone:stringOrNull,whatsapp:stringOrNull,cidade:stringOrNull,observacoes:stringOrNull,
          descricao:stringOrNull,proposta:stringOrNull,objetivo:stringOrNull,referencias:stringOrNull,estilo_musical:stringOrNull,prazo:stringOrNull,vencimento_pagamento:stringOrNull,vencimento:stringOrNull,
          tonalidade:stringOrNull,genero:stringOrNull,rotulo:stringOrNull,cargo:stringOrNull,tipo_audio:stringOrNull,
          valor:numberOrNull,bpm:numberOrNull,bpm_min:numberOrNull,bpm_max:numberOrNull,limite:numberOrNull,pago:boolOrNull,
          instrumentos:arrayOfStrings,tags:arrayOfStrings
        }}
      },required:['tool','args']
    }}
  },required:['mode','calls']
};

const fastPrompt=`Você converte uma ordem curta do Sonota em chamadas de função. NÃO converse e NÃO explique.
Use mode="fast" quando o pedido puder ser resolvido diretamente pelas funções abaixo. Use mode="agent" quando exigir raciocínio, cruzar várias áreas, comparação complexa ou quando faltar uma capacidade.

REGRAS:
- Nunca crie arranjo. Não existe função para isso.
- Criações/edições/exclusões usam funções propor_* e serão confirmadas depois.
- Se o usuário disser ADICIONAR, COLOCAR, INCLUIR, ATUALIZAR ou ALTERAR um dado EM/AO cliente que já existe, isso é propor_editar_cliente, NÃO propor_criar_cliente.
- Para criar projeto, "nome" é o nome do NOVO PROJETO; "cliente" identifica o cliente existente; "arranjo" identifica o arranjo existente.
- Pode gerar várias calls na ordem correta, por exemplo criar cliente + criar projeto para ele.
- Não invente dados que o usuário não informou. Campos ausentes ficam null/omitidos.
- Datas, se explícitas e inequívocas, use YYYY-MM-DD.
- "recebido/pago" => pago=true; "pendente/não recebido" => pago=false.
- "concluído/revisão/em produção/proposta/cancelado" são status de projeto.

CONSULTAS RÁPIDAS: buscar_clientes, obter_cliente, buscar_projetos, obter_projeto, buscar_arranjos, obter_arranjo, resumo_financeiro, listar_prazos, listar_alertas, listar_versoes_projeto, listar_historico_projeto, listar_documentos, listar_processamentos_audio, obter_perfil, abrir_pagina.
AÇÕES RÁPIDAS: propor_criar_cliente, propor_criar_projeto, propor_editar_cliente, propor_editar_projeto, propor_atualizar_pagamento, propor_editar_arranjo, propor_editar_versao, propor_marcar_versao_enviada, propor_editar_perfil, propor_excluir_cliente, propor_excluir_projeto, propor_excluir_arranjo, propor_excluir_versao, propor_excluir_documento, propor_iniciar_processamento_audio, propor_cancelar_processamento_audio, propor_excluir_processamento_audio.

EXEMPLOS DE MAPEAMENTO:
- "cadastre Alfredo telefone 1199" => propor_criar_cliente {nome, telefone}
- "adicionar o telefone 1199 ao cliente Alfredo" => propor_editar_cliente {cliente:"Alfredo", telefone:"1199"}
- "coloque o e-mail a@b.com no cliente Alfredo" => propor_editar_cliente {cliente:"Alfredo", email:"a@b.com"}
- "crie Projeto Nike para Marina usando Aurora por 5000" => propor_criar_projeto {nome:"Projeto Nike", cliente:"Marina", arranjo:"Aurora", valor:5000}
- "criar um projeto chamado musica pokemon, para o cliente Alfredo PCD com o arranjo pokemon custando 10 reais" => propor_criar_projeto {nome:"musica pokemon", cliente:"Alfredo PCD", arranjo:"pokemon", valor:10}
- "muda Aurora para concluído" => propor_editar_projeto {projeto, status}
- "marca Aurora como recebido" => propor_atualizar_pagamento {projeto, pago:true}
- "muda o BPM de Cyber para 132" => propor_editar_arranjo {arranjo, bpm}
- "qual dos meus projetos usa o arranjo hino do fogao" => buscar_projetos {arranjo:"hino do fogao"}
- "quanto tenho para receber" => resumo_financeiro {}.`;

function cleanArgs(value={}){
  const out={};
  for(const [key,v] of Object.entries(value||{})){
    if(v===null||v===undefined)continue;
    if(Array.isArray(v)){if(v.length)out[key]=v;continue}
    if(typeof v==='string'){if(v.trim()!==''||key==='arranjo')out[key]=v.trim();continue}
    out[key]=v;
  }
  // O schema chama de tipo_audio, enquanto a tool existente espera "tipo".
  if(out.tipo_audio!==undefined){out.tipo=out.tipo_audio;delete out.tipo_audio}
  return out;
}

function brl(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function shortDate(value){if(!value)return 'sem prazo';try{return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')}catch{return value}}
function compactText(value){return String(value||'').replace(/\s+/g,' ').trim()}
function trimCapture(value){return compactText(value).replace(/^[,;:\-\s]+|[,;:\-\s]+$/g,'')}

// # Conversão de valores em linguagem natural
// Entende "10 reais", "R$ 10", "5 mil" e "5.000,50" sem depender do LLM.
function parseMoney(raw,scale=''){
  if(!raw)return undefined;
  let value=String(raw).replace(/\s/g,'');
  if(value.includes(',')&&value.includes('.'))value=value.replace(/\./g,'').replace(',','.');
  else if(value.includes(','))value=value.replace(',','.');
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(value))value=value.replace(/\./g,'');
  const number=Number(value);if(!Number.isFinite(number))return undefined;
  return /mil/i.test(scale)?number*1000:number;
}

function canonicalStatus(raw=''){
  const q=String(raw).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(q.includes('proposta'))return 'Proposta';
  if(q.includes('produc')||q.includes('andamento'))return 'Em produção';
  if(q.includes('revis'))return 'Revisão';
  if(q.includes('conclu')||q.includes('finaliz')||q.includes('termin')||q.includes('encerr'))return 'Concluído';
  if(q.includes('cancel'))return 'Cancelado';
  return undefined;
}

// # Ações administrativas instantâneas
// Estas funções reconhecem comandos extremamente claros SEM chamar Ollama.
// A IA continua sendo usada quando a frase é ambígua ou exige raciocínio, mas excluir
// registros, mudar a etapa de um projeto e marcar pagamento são operações determinísticas.
function parseDeleteAction(source){
  const verb='(?:excluir|exclua|exclui|apagar|apague|apaga|remover|remova|remove|deletar|delete|deleta)';
  const patterns=[
    {entity:'cliente',tool:'propor_excluir_cliente',arg:'cliente'},
    {entity:'projeto',tool:'propor_excluir_projeto',arg:'projeto'},
    {entity:'arranjo',tool:'propor_excluir_arranjo',arg:'arranjo'}
  ];
  for(const item of patterns){
    const re=new RegExp(`^${verb}\\s+(?:o\\s+|a\\s+)?${item.entity}\\s+(?:chamad[oa]\\s+)?(.+?)[.!?]*$`,'i');
    const match=source.match(re);
    if(match){
      const value=trimCapture(match[1]);
      if(value)return {mode:'fast',calls:[{tool:item.tool,args:{[item.arg]:value}}],source:`deterministic-delete-${item.entity}`};
    }
  }
  return null;
}

function parseProjectStatusAction(source){
  const statusPattern='(proposta|em\\s+produ[cç][aã]o|produ[cç][aã]o|em\\s+andamento|revis[aã]o|conclu[ií]do|concluida|conclu[ií]da|finalizado|finalizada|terminado|terminada|encerrado|encerrada|cancelado|cancelada)';
  const verbs='(?:mudar|mude|muda|alterar|altere|altera|colocar|coloque|coloca|passar|passe|passa|mover|mova|move|marcar|marque|marca|deixar|deixe|deixa)';
  const explicit=[
    new RegExp(`^${verbs}\\s+(?:(?:o\\s+)?status\\s+(?:do\\s+)?)?(?:o\\s+)?(?:projeto\\s+)?(.+?)\\s+(?:para|pra|como|em)\\s+${statusPattern}[.!?]*$`,'i'),
    new RegExp(`^${verbs}\\s+(?:o\\s+)?(?:projeto\\s+)?(.+?)\\s+(?:no\\s+status|na\\s+etapa)\\s+${statusPattern}[.!?]*$`,'i')
  ];
  for(const re of explicit){
    const match=source.match(re);
    if(match){
      const projeto=trimCapture(match[1]),status=canonicalStatus(match[2]);
      if(projeto&&status)return {mode:'fast',calls:[{tool:'propor_editar_projeto',args:{projeto,status}}],source:'deterministic-project-status'};
    }
  }

  // # Verbos que já carregam o status
  // "finaliza Campanha Aurora", "concluir o projeto X", "cancela Projeto Y".
  const implicit=source.match(/^(concluir|conclua|conclui|finalizar|finalize|finaliza|terminar|termine|termina|encerrar|encerre|encerra|cancelar|cancele|cancela)\s+(?:o\s+)?(?:projeto\s+)?(.+?)[.!?]*$/i);
  if(implicit){
    const projeto=trimCapture(implicit[2]);
    const status=/cancel/i.test(implicit[1])?'Cancelado':'Concluído';
    if(projeto)return {mode:'fast',calls:[{tool:'propor_editar_projeto',args:{projeto,status}}],source:'deterministic-project-status-implicit'};
  }
  return null;
}

function parsePaymentAction(source){
  const received=source.match(/^(?:marcar|marque|marca|colocar|coloque|coloca|alterar|altere|altera|mudar|mude|muda)\s+(?:(?:o\s+)?pagamento\s+(?:do\s+)?(?:projeto\s+)?|(?:o\s+)?projeto\s+)?(.+?)\s+(?:como|para|pra)\s+(recebido|pago|quitado)[.!?]*$/i);
  if(received){
    const projeto=trimCapture(received[1]);
    if(projeto)return {mode:'fast',calls:[{tool:'propor_atualizar_pagamento',args:{projeto,pago:true}}],source:'deterministic-payment-received'};
  }
  const pending=source.match(/^(?:marcar|marque|marca|colocar|coloque|coloca|alterar|altere|altera|mudar|mude|muda)\s+(?:(?:o\s+)?pagamento\s+(?:do\s+)?(?:projeto\s+)?|(?:o\s+)?projeto\s+)?(.+?)\s+(?:como|para|pra)\s+(pendente|a\s+receber|n[aã]o\s+recebido|n[aã]o\s+pago)[.!?]*$/i);
  if(pending){
    const projeto=trimCapture(pending[1]);
    if(projeto)return {mode:'fast',calls:[{tool:'propor_atualizar_pagamento',args:{projeto,pago:false}}],source:'deterministic-payment-pending'};
  }
  return null;
}

// # Interpretação determinística de ordens muito claras
// O modelo pequeno continua sendo o interpretador geral, mas algumas frases comuns de CRUD
// são mais seguras e mais rápidas se forem reconhecidas localmente. Isso também corrige
// pequenas escolhas erradas do 1.7B, como tratar "adicionar telefone AO cliente" como criação.
function parseDeterministicFast(text){
  const source=compactText(text);
  if(!source)return null;

  // # Prioridade 1: ações administrativas instantâneas
  // Se uma ordem é clara o suficiente, não faz sentido gastar uma inferência local.
  const deleteAction=parseDeleteAction(source);
  if(deleteAction)return deleteAction;
  const projectStatus=parseProjectStatusAction(source);
  if(projectStatus)return projectStatus;
  const paymentAction=parsePaymentAction(source);
  if(paymentAction)return paymentAction;

  // # Relação projeto ↔ arranjo sem inferência
  // Ex.: "qual dos meus projetos usa o arranjo hino do fogao?"
  const projectByArrangement=source.match(/^(?:qual|quais|liste|listar|mostre|mostrar)?\s*(?:dos\s+meus\s+|meus\s+)?projetos?\s+(?:usa|usam|utiliza|utilizam|tem|têm|possui|possuem)\s+(?:como\s+arranjo\s+)?(?:o\s+)?arranjo\s+["“']?(.+?)["”']?[.!?]*$/i)
    || source.match(/^(?:qual|quais)\s+(?:dos\s+)?(?:meus\s+)?projetos?.*?(?:arranjo)\s+["“'](.+?)["”'][.!?]*$/i);
  if(projectByArrangement){const arranjo=trimCapture(projectByArrangement[1]);if(arranjo)return {mode:'fast',calls:[{tool:'buscar_projetos',args:{arranjo}}],source:'deterministic-projects-by-arrangement'};}

  // Cadastro simples de cliente é uma intenção determinística: sem inferência Qwen.
  // Evita períodos de espera que permitem o mesmo cadastro ser feito manualmente.
  const createClient=source.match(/^(?:criar|crie|cadastrar|cadastre|cadastra|adicionar|adicione|adiciona|inclua|inclui|registre|registrar)\s+(?:um\s+|uma\s+|novo\s+|nova\s+|o\s+|a\s+)*cliente\s+(?:chamad[oa]\s+|com\s+(?:o\s+)?nome\s+|de\s+nome\s+)?(.+)$/i);
  if(createClient){
    const rawName=createClient[1].replace(/[.!?]+$/,'').trim();
    const cut=rawName.match(/^(.+?)(?=\s*(?:,|;)?\s+(?:com\s+)?(?:telefone|fone|whatsapp|e-?mail|email)\s*[:=]?\s*|$)/i);
    const nome=trimCapture(cut?.[1]||'');
    const telefone=rawName.match(/(?:telefone|fone)\s*[:=]?\s*([+()\d.\s-]{8,})/i);
    const whatsapp=rawName.match(/(?:whatsapp|whats)\s*[:=]?\s*([+()\d.\s-]{8,})/i);
    const email=rawName.match(/(?:e-?mail)\s*[:=]?\s*([^\s,;]+@[^\s,;]+)/i);
    if(nome){
      const args={nome};
      if(telefone)args.telefone=trimCapture(telefone[1]);
      if(whatsapp)args.whatsapp=trimCapture(whatsapp[1]);
      if(email)args.email=trimCapture(email[1]);
      return {mode:'fast',calls:[{tool:'propor_criar_cliente',args}],source:'deterministic-create-client'};
    }
  }

  // Consultas objetivas de clientes também dispensam o modelo local.
  const findClients=source.match(/^(?:liste|listar|mostre|mostrar|me\s+mostre|quais\s+s[aã]o)\s+(?:(?:os|meus|todos\s+os)\s+)?clientes(?:\s+(?:com\s+(?:o\s+)?nome|chamados?)\s+(.+))?[.!?]*$/i);
  if(findClients)return {mode:'fast',calls:[{tool:'buscar_clientes',args:findClients[1]?{consulta:trimCapture(findClients[1])}:{}}],source:'deterministic-list-clients'};

  // Consultas objetivas à Biblioteca: aplicamos filtros sem iniciar o modelo.
  const bpmMinimum=source.match(/(?:pelo\s+menos|no\s+m[ií]nimo|a\s+partir\s+de|maior(?:es)?\s+que|acima\s+de)\s*(\d{2,3})\s*(?:de\s*)?bpm/i);
  const bpmMaximum=source.match(/(?:no\s+m[aá]ximo|at[eé]\s+|menor(?:es)?\s+que|abaixo\s+de)\s*(\d{2,3})\s*(?:de\s*)?bpm/i);
  if(/arranjos?|biblioteca/i.test(source)&&(bpmMinimum||bpmMaximum)){
    const args={};
    if(bpmMinimum)args.bpm_min=Number(bpmMinimum[1]);
    if(bpmMaximum)args.bpm_max=Number(bpmMaximum[1]);
    return {mode:'fast',calls:[{tool:'buscar_arranjos',args}],source:'deterministic-arrangements-bpm'};
  }
  const exactArrangement=source.match(/^(?:me\s+d[eê]|encontre|procure|busque|mostre|qual\s+[eé])\s+(?:um\s+|o\s+)?arranjo\s+(?:com\s+o\s+nome|de\s+nome|chamado)\s+["“']?(.+?)["”']?[.!?]*$/i);
  if(exactArrangement)return {mode:'fast',calls:[{tool:'obter_arranjo',args:{arranjo:trimCapture(exactArrangement[1]).replace(/["”']$/,'')}}],source:'deterministic-arrangement-name'};

  // # Editar telefone/WhatsApp/e-mail de um cliente existente
  // Ex.: "adicionar o telefone: 1196969969 ao cliente Alfredo PCD"
  const editVerb='(?:adicionar|adicione|adiciona|colocar|coloque|coloca|incluir|inclua|inclui|alterar|altere|altera|mudar|mude|muda|trocar|troque|troca|atualizar|atualize|atualiza)';
  const phone=source.match(new RegExp(`${editVerb}\\s+(?:o\\s+)?(?:telefone|fone)\\s*[:=\\-]?\\s*([+()\\d.\\s-]{8,}?)\\s+(?:ao|no|para\\s+o|do)\\s+cliente\\s+(.+)$`,'i'));
  if(phone)return {mode:'fast',calls:[{tool:'propor_editar_cliente',args:{cliente:trimCapture(phone[2]),telefone:trimCapture(phone[1])}}],source:'deterministic-client-phone'};

  const whatsapp=source.match(new RegExp(`${editVerb}\\s+(?:o\\s+)?whats(?:app)?\\s*[:=\\-]?\\s*([+()\\d.\\s-]{8,}?)\\s+(?:ao|no|para\\s+o|do)\\s+cliente\\s+(.+)$`,'i'));
  if(whatsapp)return {mode:'fast',calls:[{tool:'propor_editar_cliente',args:{cliente:trimCapture(whatsapp[2]),whatsapp:trimCapture(whatsapp[1])}}],source:'deterministic-client-whatsapp'};

  const email=source.match(new RegExp(`${editVerb}\\s+(?:o\\s+)?(?:e-?mail)\\s*[:=\\-]?\\s*([^\\s,;]+@[^\\s,;]+)\\s+(?:ao|no|para\\s+o|do)\\s+cliente\\s+(.+)$`,'i'));
  if(email)return {mode:'fast',calls:[{tool:'propor_editar_cliente',args:{cliente:trimCapture(email[2]),email:trimCapture(email[1])}}],source:'deterministic-client-email'};

  // # Criar projeto relacionando cliente e arranjo por nome
  // Ex.: "criar um projeto chamado musica pokemon, para o cliente alfredo pcc com o arranjo pokemon"
  if(/\b(?:criar|crie|cadastrar|cadastre)\b/i.test(source)&&/\bprojeto\b/i.test(source)){
    const stop='(?=[,;]?\\s+(?:para\\s+(?:o\\s+)?cliente|com\\s+(?:o\\s+)?arranjo|usando\\s+(?:o\\s+)?arranjo|custando\\b|no\\s+valor\\s+de\\b|valor\\s+de\\b|por\\s+(?:r\\$\\s*)?[\\d.,]+|com\\s+(?:o\\s+)?status|status\\b)|$)';
    const name=source.match(new RegExp('(?:criar|crie|cadastrar|cadastre)\\s+(?:um\\s+)?projeto(?:\\s+chamado)?\\s+(.+?)'+stop,'i'));
    const client=source.match(new RegExp('para\\s+(?:o\\s+)?cliente\\s+(.+?)'+stop,'i'));
    const arrangement=source.match(new RegExp('(?:com|usando)\\s+(?:o\\s+)?arranjo\\s+(.+?)'+stop,'i'));
    if(name&&client){
      const args={nome:trimCapture(name[1]),cliente:trimCapture(client[1])};
      if(arrangement)args.arranjo=trimCapture(arrangement[1]);
      const money=source.match(/(?:custando|no\s+valor\s+de|valor\s+de|por)\s+(?:r\$\s*)?([\d.]+(?:,\d+)?)(?:\s*(mil|reais?|rs))?/i);
      if(money){const value=parseMoney(money[1],money[2]);if(value!==undefined)args.valor=value}
      const status=source.match(/(?:com\s+(?:o\s+)?status|status)\s*(?:de\s*)?(proposta|em\s+produ[cç][aã]o|revis[aã]o|conclu[ií]do|cancelado)/i);
      if(status)args.status=canonicalStatus(status[1]);
      return {mode:'fast',calls:[{tool:'propor_criar_projeto',args}],source:'deterministic-create-project'};
    }
  }
  return null;
}

// # Formatação determinística para leituras rápidas
// Evita uma segunda chamada ao LLM apenas para transformar JSON em frase.
function formatRead(tool,result){
  if(!result?.ok)return result?.message||'Não consegui concluir a consulta.';
  if(tool==='resumo_financeiro')return `Recebido: ${brl(result.received)}. A receber: ${brl(result.receivable)}. Previsão em projetos ativos: ${brl(result.forecast)}.`;
  if(tool==='buscar_clientes')return result.items?.length?`Encontrei ${result.items.length} cliente(s): ${result.items.slice(0,8).map(x=>x.name).join(', ')}.`:'Não encontrei clientes com esses critérios.';
  if(tool==='buscar_projetos')return result.items?.length?`Encontrei ${result.items.length} projeto(s): ${result.items.slice(0,8).map(x=>`${x.name} (${x.status})`).join(', ')}.`:'Não encontrei projetos com esses critérios.';
  if(tool==='buscar_arranjos')return result.items?.length?`Encontrei ${result.items.length} arranjo(s): ${result.items.slice(0,8).map(x=>`${x.title}${x.bpm?` • ${x.bpm} BPM`:''}`).join(', ')}.`:'Não encontrei arranjos com esses critérios.';
  if(tool==='listar_prazos')return result.items?.length?`Próximas entregas: ${result.items.slice(0,6).map(x=>`${x.name} — ${shortDate(x.dueDate)}${x.overdue?' (atrasado)':''}`).join('; ')}.`:'Não há entregas próximas cadastradas.';
  if(tool==='listar_alertas')return result.items?.length?`Encontrei ${result.items.length} pendência(s): ${result.items.slice(0,6).map(x=>`${x.title} — ${x.detail}`).join('; ')}.`:'Não encontrei pendências importantes.';
  if(tool==='listar_versoes_projeto')return result.items?.length?`${result.project?.name||'Projeto'} tem ${result.items.length} versão(ões): ${result.items.slice(0,8).map(x=>`V${x.number} ${x.label||''} (${x.status})`).join(', ')}.`:'Esse projeto ainda não possui versões.';
  if(tool==='listar_documentos')return result.items?.length?`Encontrei ${result.items.length} documento(s): ${result.items.slice(0,8).map(x=>x.fileName||x.name).join(', ')}.`:'Não encontrei documentos.';
  if(tool==='listar_processamentos_audio')return result.items?.length?`Encontrei ${result.items.length} processamento(s): ${result.items.slice(0,6).map(x=>`${x.type} (${x.status})`).join(', ')}.`:'Não encontrei processamentos de áudio.';
  if(tool==='obter_cliente'){
    const c=result.client,s=result.summary;return `${c.name}${c.company?` • ${c.company}`:''}. Telefone: ${c.phone||c.whatsapp||'não informado'}. Projetos: ${s.projects}; ativos: ${s.active}; contratado: ${brl(s.contracted)}; recebido: ${brl(s.received)}; pendente: ${brl(s.pending)}.`;
  }
  if(tool==='obter_projeto'){
    const p=result.project;return `${p.name}: ${p.status}. Cliente: ${result.client?.name||'—'}. Arranjo: ${result.arrangement?.title||'não associado'}. Valor: ${brl(p.value)}. Prazo: ${shortDate(p.dueDate)}. Pagamento: ${p.paid?'recebido':'pendente'}.`;
  }
  if(tool==='obter_arranjo'){
    const a=result.arrangement;return `${a.title}: ${a.bpm||'—'} BPM, ${a.key||'tonalidade não informada'}, ${a.genre||'gênero não informado'}. Instrumentos: ${(a.instruments||[]).join(', ')||'não informados'}. Tags: ${(a.tags||[]).join(', ')||'sem tags'}.`;
  }
  if(tool==='obter_perfil'){const p=result.profile;return `${p.name}. Empresa/estúdio: ${p.studio||'—'}. Cargo: ${p.role||'—'}. Telefone: ${p.phone||'—'}.`}
  if(tool==='abrir_pagina')return result.message||'Página preparada para abrir.';
  if(tool==='listar_historico_projeto')return result.items?.length?`Últimas atividades de ${result.project?.name||'projeto'}: ${result.items.slice(0,6).map(x=>x.message||x.type).join('; ')}.`:'Não há atividades registradas.';
  return 'Consulta concluída.';
}

function failureText(result){
  if(result?.candidates?.length)return `${result.message||'Encontrei mais de uma opção.'} Opções: ${result.candidates.map(x=>x.name||x.title||x.id).join(', ')}.`;
  return result?.message||'Não consegui preparar essa ação.';
}

export function isGreeting(text){
  const q=String(text||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return /^(oi|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|salve|hey|hello)[!.?\s]*$/.test(q);
}

export async function runFast({db,config,userId,text,context={}}){
  if(!config.aiFastEnabled)return {handled:false};

  // # Primeiro caminho: comandos determinísticos de alta confiança
  // Não chama Ollama quando a frase já contém estrutura suficiente para uma ação segura.
  // Além de acelerar, isso evita que um modelo pequeno confunda criação com edição.
  let parsed=parseDeterministicFast(text);
  let modelUsed='local-fast-parser';

  if(!parsed){
    const response=await ollamaChat(config,{
      model:config.aiFastModel,think:false,timeoutMs:config.aiFastTimeoutMs,format:fastFormat,
      messages:[{role:'system',content:fastPrompt},{role:'user',content:`Contexto da tela: ${context.page||'não informado'}${context.projectId?`, projeto_id=${context.projectId}`:''}.\nPedido: ${text}`}],
      options:{num_ctx:config.aiFastContext,num_predict:config.aiFastPredict,temperature:config.aiTemperature},
      keepAlive:config.aiKeepAlive
    });
    modelUsed=config.aiFastModel;
    try{parsed=JSON.parse(response.message.content||'{}')}catch{return {handled:false}}
  }

  if(parsed.mode!=='fast'||!Array.isArray(parsed.calls)||!parsed.calls.length)return {handled:false};

  const runtime=createToolRuntime({db,config,userId});
  const readTexts=[];
  const contextualProjectTools=new Set(['obter_projeto','listar_versoes_projeto','listar_historico_projeto','listar_documentos','propor_editar_projeto','propor_atualizar_pagamento','propor_excluir_projeto','propor_editar_versao','propor_marcar_versao_enviada','propor_excluir_versao']);
  for(const call of parsed.calls.slice(0,6)){
    if(!FAST_TOOLS.includes(call.tool))return {handled:false};
    const args=cleanArgs(call.args);
    // # Contexto da tela sem nova inferência
    // Se o usuário disser "esse projeto" na página de um projeto, usamos o ID já
    // conhecido pelo frontend em vez de pedir ao modelo para descobrir novamente.
    if(context.projectId&&contextualProjectTools.has(call.tool)&&!args.projeto)args.projeto=String(context.projectId);
    const result=await runtime.execute(call.tool,args);
    if(!result?.ok){
      const message=failureText(result);
      saveAiMessage(db,userId,'assistant','user',text,{context,mode:'fast',parser:parsed.source||'ollama'});
      saveAiMessage(db,userId,'assistant','assistant',message,{mode:'fast',error:true});
      return {handled:true,response:{message,mode:'fast',model:modelUsed,navigate:runtime.navigate}};
    }
    if(!call.tool.startsWith('propor_'))readTexts.push(formatRead(call.tool,result));
  }

  const action=runtime.operations.length?saveAssistantProposal(db,userId,runtime.operations,runtime.changes):undefined;
  const message=action
    ?(runtime.operations.length===1?'Preparei a alteração solicitada. Revise o card e confirme para salvar.':`Preparei ${runtime.operations.length} alterações. Revise o card e confirme para salvar todas.`)
    :(readTexts.filter(Boolean).join('\n')||'Consulta concluída.');
  saveAiMessage(db,userId,'assistant','user',text,{context,mode:'fast',parser:parsed.source||'ollama'});
  saveAiMessage(db,userId,'assistant','assistant',message,{mode:'fast',hasAction:!!action});
  return {handled:true,response:{message,action,navigate:runtime.navigate,mode:'fast',model:modelUsed}};
}
