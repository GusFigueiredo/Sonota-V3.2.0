import { clientSchema,projectSchema,updateSchema,arrangementSchema } from '../validation.js';
import { listClients,listArrangements,listProjects,listDocs,listJobs,financeSummary,profile } from '../db.js';
import { definitions,entity } from '../entities.js';
import { listProjectEvents,listProjectVersions,operationalAlerts,upcomingDeliveries } from '../workflow.js';
import { normalize,similarity,search as searchLibrary } from '../search.js';

const DUMMY_UUID='00000000-0000-4000-8000-000000000000';
const PAGE_VALUES=['home','dashboard','clientes','projetos','arranjos','biblioteca','financeiro','perfil'];

// # Schemas que o modelo enxerga
// São propositalmente explícitos: a IA não recebe uma ferramenta genérica de SQL.
// Cada função representa uma capacidade real e controlada do Sonota.
const fn=(name,description,properties={},required=[])=>({
  type:'function',function:{name,description,parameters:{type:'object',properties,...(required.length?{required}:{}),additionalProperties:false}}
});
const str=(description,extra={})=>({type:'string',description,...extra});
const num=(description,extra={})=>({type:'number',description,...extra});
const bool=description=>({type:'boolean',description});
const arr=(description)=>({type:'array',description,items:{type:'string'}});

export const assistantTools=[
  // # Consultas
  fn('buscar_clientes','Procura clientes por nome, empresa, telefone, e-mail, cidade ou observações.',{consulta:str('Texto livre para localizar o cliente.'),status:str('Opcional: Ativo, Prospect, Pausado ou Inativo.')},[]),
  fn('obter_cliente','Obtém os dados completos e resumo de um cliente.',{cliente:str('Nome ou ID do cliente.')},['cliente']),
  fn('buscar_projetos','Procura projetos e permite filtrar etapa, cliente, arranjo e pagamento.',{consulta:str('Nome/descrição/proposta ou texto livre.'),status:str('Proposta, Em produção, Revisão, Concluído ou Cancelado.'),cliente:str('Nome ou ID do cliente.'),arranjo:str('Nome ou ID do arranjo vinculado.'),pago:bool('true para recebidos; false para pendentes.')},[]),
  fn('obter_projeto','Obtém projeto, cliente, arranjo, versões, documentos e histórico.',{projeto:str('Nome ou ID do projeto.')},['projeto']),
  fn('buscar_arranjos','Procura arranjos existentes. Esta ferramenta é somente de leitura; o Assistente NÃO cria arranjos.',{consulta:str('Nome, gênero, instrumento, tag, observação ou contexto.'),bpm_min:num('BPM mínimo.'),bpm_max:num('BPM máximo.'),tonalidade:str('Ex.: F#m.'),genero:str('Gênero musical.')},[]),
  fn('obter_arranjo','Obtém os metadados de um arranjo já cadastrado.',{arranjo:str('Nome ou ID do arranjo.')},['arranjo']),
  fn('buscar_biblioteca_semantica','Faz a Busca Inteligente integrada à Biblioteca, combinando filtros e significado.',{consulta:str('Pedido em linguagem natural.'),limite:num('Máximo de resultados, entre 1 e 20.')},['consulta']),
  fn('resumo_financeiro','Retorna recebido, a receber e previsão financeira.',{}),
  fn('listar_prazos','Lista próximas entregas e projetos atrasados.',{}),
  fn('listar_alertas','Lista pendências operacionais do Dashboard.',{}),
  fn('listar_versoes_projeto','Lista protótipos/versões de um projeto.',{projeto:str('Nome ou ID do projeto.')},['projeto']),
  fn('listar_historico_projeto','Lista o histórico de atividades de um projeto.',{projeto:str('Nome ou ID do projeto.'),limite:num('Quantidade máxima de eventos.')},['projeto']),
  fn('listar_documentos','Lista notas fiscais/documentos, opcionalmente de um projeto.',{projeto:str('Nome ou ID do projeto, opcional.')},[]),
  fn('listar_processamentos_audio','Lista processamentos de áudio (stems/MIDI/partitura/análise).',{arranjo:str('Nome ou ID do arranjo, opcional.')},[]),
  fn('obter_perfil','Lê nome, empresa/estúdio, cargo e telefone do usuário.',{}),
  fn('abrir_pagina','Solicita que a interface navegue para uma página do Sonota.',{pagina:{type:'string',enum:PAGE_VALUES,description:'Página a abrir.'}},['pagina']),

  // # Criações permitidas
  fn('propor_criar_cliente','Propõe cadastrar um novo cliente. A alteração só ocorre após confirmação do usuário.',{
    nome:str('Nome do cliente.'),tipo:{type:'string',enum:['Pessoa','Empresa']},empresa:str('Empresa.'),email:str('E-mail.'),telefone:str('Telefone.'),whatsapp:str('WhatsApp.'),documento:str('CPF/CNPJ.'),cidade:str('Cidade.'),observacoes:str('Observações.'),status:{type:'string',enum:['Ativo','Prospect','Pausado','Inativo']}
  },['nome']),
  fn('propor_criar_projeto','Propõe criar projeto e relacionar cliente/arranjo existentes. Pode apontar para um cliente que também esteja sendo criado nesta mesma conversa.',{
    nome:str('Nome do projeto.'),cliente:str('Nome ou ID do cliente.'),arranjo:str('Nome ou ID do arranjo já existente, opcional.'),descricao:str('Descrição.'),proposta:str('Briefing/proposta.'),objetivo:str('Objetivo.'),referencias:str('Referências.'),estilo_musical:str('Estilo musical.'),instrumentos:arr('Instrumentos.'),status:{type:'string',enum:['Proposta','Em produção','Revisão','Concluído','Cancelado']},valor:num('Valor em reais.'),prazo:str('Data YYYY-MM-DD.'),vencimento_pagamento:str('Data YYYY-MM-DD.'),pago:bool('Se já foi recebido.')
  },['nome','cliente']),

  // # Edições permitidas
  fn('propor_editar_cliente','Propõe alterar campos de um cliente existente.',{
    cliente:str('Nome ou ID do cliente.'),nome:str('Novo nome.'),tipo:{type:'string',enum:['Pessoa','Empresa']},empresa:str('Empresa.'),email:str('E-mail.'),telefone:str('Telefone.'),whatsapp:str('WhatsApp.'),documento:str('CPF/CNPJ.'),cidade:str('Cidade.'),observacoes:str('Observações.'),status:{type:'string',enum:['Ativo','Prospect','Pausado','Inativo']}
  },['cliente']),
  fn('propor_editar_projeto','Propõe alterar qualquer dado textual/financeiro/operacional de um projeto.',{
    projeto:str('Nome ou ID do projeto.'),nome:str('Novo nome.'),cliente:str('Novo cliente, nome ou ID.'),arranjo:str('Novo arranjo, nome/ID; use string vazia para remover.'),descricao:str('Descrição.'),proposta:str('Briefing/proposta.'),objetivo:str('Objetivo.'),referencias:str('Referências.'),estilo_musical:str('Estilo musical.'),instrumentos:arr('Instrumentos.'),status:{type:'string',enum:['Proposta','Em produção','Revisão','Concluído','Cancelado']},valor:num('Valor em reais.'),prazo:str('Data YYYY-MM-DD.'),vencimento_pagamento:str('Data YYYY-MM-DD.'),pago:bool('Pagamento recebido.')
  },['projeto']),
  fn('propor_atualizar_pagamento','Propõe atualizar situação financeira de um projeto.',{projeto:str('Nome ou ID do projeto.'),pago:bool('true = recebido; false = pendente.'),valor:num('Novo valor, opcional.'),vencimento:str('Novo vencimento YYYY-MM-DD, opcional.')},['projeto','pago']),
  fn('propor_editar_arranjo','Propõe editar metadados de um arranjo existente. Nunca cadastra um novo arquivo/arranjo.',{
    arranjo:str('Nome ou ID do arranjo.'),nome:str('Novo nome.'),bpm:num('BPM entre 20 e 300.'),tonalidade:str('Ex.: C, Am, F#m.'),genero:str('Gênero.'),instrumentos:arr('Lista de instrumentos.'),tags:arr('Tags.'),observacoes:str('Observações.')
  },['arranjo']),
  fn('propor_editar_versao','Propõe editar rótulo, observações ou status de uma versão de projeto.',{projeto:str('Nome ou ID do projeto.'),versao:str('ID, número (ex.: 2/V2) ou rótulo da versão.'),rotulo:str('Novo rótulo.'),observacoes:str('Observações.'),status:{type:'string',enum:['Protótipo','Revisão','Aprovado','Master']}},['projeto','versao']),
  fn('propor_marcar_versao_enviada','Propõe marcar uma versão como enviada ao cliente.',{projeto:str('Nome ou ID do projeto.'),versao:str('ID, número ou rótulo da versão.')},['projeto','versao']),
  fn('propor_editar_perfil','Propõe alterar dados não sensíveis do perfil. E-mail, senha e avatar continuam pela tela por segurança.',{nome:str('Nome.'),empresa:str('Empresa/estúdio.'),cargo:str('Cargo.'),telefone:str('Telefone.')},[]),

  // # Exclusões permitidas
  fn('propor_excluir_cliente','Propõe excluir um cliente. O backend recusará se ele ainda estiver vinculado a projetos.',{cliente:str('Nome ou ID do cliente.')},['cliente']),
  fn('propor_excluir_projeto','Propõe excluir um projeto e seus dados dependentes conforme as regras atuais do app.',{projeto:str('Nome ou ID do projeto.')},['projeto']),
  fn('propor_excluir_arranjo','Propõe excluir um arranjo existente. Não funciona se estiver vinculado a projeto ou processamento ativo.',{arranjo:str('Nome ou ID do arranjo.')},['arranjo']),
  fn('propor_excluir_versao','Propõe excluir uma versão/protótipo de projeto.',{projeto:str('Nome ou ID do projeto.'),versao:str('ID, número ou rótulo.')},['projeto','versao']),
  fn('propor_excluir_documento','Propõe excluir uma nota fiscal/documento.',{documento:str('ID ou nome do arquivo do documento.')},['documento']),

  // # Laboratório de áudio
  fn('propor_iniciar_processamento_audio','Propõe iniciar stems, MIDI, partitura ou análise em um arranjo existente.',{arranjo:str('Nome ou ID do arranjo.'),tipo:{type:'string',enum:['analysis','stems','midi','partitura']}},['arranjo','tipo']),
  fn('propor_cancelar_processamento_audio','Propõe cancelar um processamento ainda em fila/execução.',{processamento:str('ID do processamento.')},['processamento']),
  fn('propor_excluir_processamento_audio','Propõe excluir um processamento já finalizado/cancelado.',{processamento:str('ID do processamento.')},['processamento'])
];

const labelMap={clients:'Cliente',projects:'Projeto',arrangements:'Arranjo'};
const fieldLabels={
  name:'Nome',type:'Tipo',company:'Empresa',email:'E-mail',phone:'Telefone',whatsapp:'WhatsApp',document:'CPF/CNPJ',city:'Cidade',notes:'Observações',status:'Status',
  clientId:'Cliente',arrangementId:'Arranjo',description:'Descrição',proposal:'Proposta / briefing',objective:'Objetivo',references:'Referências',musicalStyle:'Estilo musical',instruments:'Instrumentos',value:'Valor',dueDate:'Prazo',paymentDueDate:'Vencimento',paid:'Pagamento recebido',
  title:'Nome',bpm:'BPM',key:'Tonalidade',genre:'Gênero',tags:'Tags',label:'Rótulo'
};

function display(v){
  if(Array.isArray(v))return v.join(', ')||'—';
  if(typeof v==='boolean')return v?'Sim':'Não';
  if(v===null||v===undefined||v==='')return '—';
  if(typeof v==='number')return String(v);
  return String(v);
}
function brl(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function publicList(items,max=20){return items.slice(0,max)}

// # Localizador seguro de registros
// IDs exatos ganham prioridade. Para nomes, usamos igualdade/contém/fuzzy e recusamos
// ambiguidade em vez de deixar a IA escolher silenciosamente um registro parecido.
export function resolveRecord(items,query,label='name'){
  const raw=String(query||'').trim();
  if(!raw)return {ok:false,error:'MISSING_QUERY',message:'Informe o registro.'};
  const byId=items.find(i=>i.id===raw);if(byId)return {ok:true,item:byId};
  const q=normalize(raw).trim();
  const exact=items.filter(i=>normalize(i[label])===q);if(exact.length===1)return {ok:true,item:exact[0]};
  const contains=items.filter(i=>normalize(i[label]).includes(q)||q.includes(normalize(i[label])));
  if(contains.length===1)return {ok:true,item:contains[0]};
  const ranked=items.map(item=>({item,score:similarity(normalize(item[label]),q)})).sort((a,b)=>b.score-a.score);
  if(!ranked[0]||ranked[0].score<.64)return {ok:false,error:'NOT_FOUND',message:`Não encontrei “${raw}”.`};
  if((ranked[1]&&ranked[0].score-ranked[1].score<.08)||contains.length>1){
    const pool=(contains.length?contains:ranked.slice(0,4).map(r=>r.item)).slice(0,4);
    return {ok:false,error:'AMBIGUOUS',message:`Encontrei mais de uma opção para “${raw}”.`,candidates:pool.map(i=>({id:i.id,name:i[label]}))};
  }
  return {ok:true,item:ranked[0].item};
}

function resolveVersion(versions,query){
  const raw=String(query||'').trim();
  const byId=versions.find(v=>v.id===raw);if(byId)return {ok:true,item:byId};
  const number=Number(raw.replace(/^v/i,''));
  if(Number.isInteger(number)){const v=versions.find(x=>x.number===number);if(v)return {ok:true,item:v}}
  return resolveRecord(versions,raw,'label');
}

function pickDefined(obj,map){
  const out={};for(const [from,to] of Object.entries(map))if(obj[from]!==undefined)out[to]=obj[from];return out;
}
function previewFor(table,item,patch){
  return Object.entries(patch).map(([field,to])=>({field:`${labelMap[table]||table} • ${fieldLabels[field]||field}`,from:display(item?.[field]),to:field==='value'?brl(to):display(to)}));
}

// # Runtime de tools por mensagem
// As operações de escrita são somente acumuladas em memory (operations). Nada é gravado
// no banco aqui. Ao final da resposta o agent.js transforma o conjunto em UM card de confirmação.
export function createToolRuntime({db,config,userId}){
  const operations=[];const changes=[];let navigate=null;
  const pendingClients=[];
  const clients=()=>listClients(db,userId),projects=()=>listProjects(db,userId),arrangements=()=>listArrangements(db,userId);
  const result=(ok,data={})=>({ok,...data});
  const fail=(resolved)=>result(false,{error:resolved.error,message:resolved.message,candidates:resolved.candidates});
  const resolveClient=q=>resolveRecord(clients(),q,'name');
  const resolveProject=q=>resolveRecord(projects(),q,'name');
  const resolveArrangement=q=>resolveRecord(arrangements(),q,'title');

  function queue(operation,preview=[]){
    const index=operations.length;operations.push(operation);changes.push(...preview);return {index,ref:`op:${index}`};
  }
  function pendingClientByName(name){
    const q=normalize(name);const hit=pendingClients.find(x=>normalize(x.name)===q);return hit||null;
  }

  async function execute(name,args={}){
    try{
      switch(name){
        // # READ TOOLS ------------------------------------------------------
        case 'buscar_clientes':{
          const q=normalize(args.consulta||'');let rows=clients();
          if(q)rows=rows.filter(c=>normalize(JSON.stringify(c)).includes(q));if(args.status)rows=rows.filter(c=>c.status===args.status);
          return result(true,{items:publicList(rows).map(c=>({id:c.id,name:c.name,company:c.company,status:c.status,phone:c.phone,whatsapp:c.whatsapp,email:c.email}))});
        }
        case 'obter_cliente':{
          const r=resolveClient(args.cliente);if(!r.ok)return fail(r);const c=r.item,ps=projects().filter(p=>p.clientId===c.id);
          return result(true,{client:c,summary:{projects:ps.length,active:ps.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length,contracted:ps.reduce((n,p)=>n+p.value,0),received:ps.filter(p=>p.paid).reduce((n,p)=>n+p.value,0),pending:ps.filter(p=>!p.paid&&p.status!=='Cancelado').reduce((n,p)=>n+p.value,0)}});
        }
        case 'buscar_projetos':{
          const q=normalize(args.consulta||'');let rows=projects();
          if(q)rows=rows.filter(p=>normalize(JSON.stringify(p)).includes(q));if(args.status)rows=rows.filter(p=>p.status===args.status);if(typeof args.pago==='boolean')rows=rows.filter(p=>p.paid===args.pago);
          if(args.cliente){const c=resolveClient(args.cliente);if(!c.ok)return fail(c);rows=rows.filter(p=>p.clientId===c.item.id)}
          if(args.arranjo){const a=resolveArrangement(args.arranjo);if(!a.ok)return fail(a);rows=rows.filter(p=>p.arrangementId===a.item.id)}
          return result(true,{items:publicList(rows).map(p=>({id:p.id,name:p.name,status:p.status,value:p.value,dueDate:p.dueDate,paid:p.paid,clientId:p.clientId,arrangementId:p.arrangementId}))});
        }
        case 'obter_projeto':{
          const r=resolveProject(args.projeto);if(!r.ok)return fail(r);const p=r.item;
          return result(true,{project:p,client:entity(db,'clients',p.clientId,userId),arrangement:p.arrangementId?entity(db,'arrangements',p.arrangementId,userId):null,versions:listProjectVersions(db,userId,p.id),documents:listDocs(db,userId).filter(d=>d.projectId===p.id),history:listProjectEvents(db,userId,p.id,30)});
        }
        case 'buscar_arranjos':{
          const q=normalize(args.consulta||'');let rows=arrangements();
          if(q)rows=rows.filter(a=>normalize(JSON.stringify(a)).includes(q));if(Number.isFinite(args.bpm_min))rows=rows.filter(a=>a.bpm!=null&&a.bpm>=args.bpm_min);if(Number.isFinite(args.bpm_max))rows=rows.filter(a=>a.bpm!=null&&a.bpm<=args.bpm_max);if(args.tonalidade)rows=rows.filter(a=>normalize(a.key)===normalize(args.tonalidade));if(args.genero)rows=rows.filter(a=>normalize(a.genre).includes(normalize(args.genero)));
          return result(true,{items:publicList(rows).map(a=>({id:a.id,title:a.title,bpm:a.bpm,key:a.key,genre:a.genre,instruments:a.instruments,tags:a.tags,notes:a.notes}))});
        }
        case 'obter_arranjo':{const r=resolveArrangement(args.arranjo);return r.ok?result(true,{arrangement:r.item}):fail(r)}
        case 'buscar_biblioteca_semantica':{
          const output=await searchLibrary(db,config,userId,args.consulta,Math.max(1,Math.min(20,Number(args.limite)||10)),{saveConversation:false});
          return result(true,{mode:output.mode,criteria:output.criteria,items:output.results.map(x=>({id:x.arrangement.id,title:x.arrangement.title,relevance:x.relevance,bpm:x.arrangement.bpm,key:x.arrangement.key,genre:x.arrangement.genre,matched:x.matched,linked:x.linked}))});
        }
        case 'resumo_financeiro':return result(true,financeSummary(db,userId));
        case 'listar_prazos':return result(true,{items:upcomingDeliveries(db,userId)});
        case 'listar_alertas':return result(true,{items:operationalAlerts(db,userId)});
        case 'listar_versoes_projeto':{const p=resolveProject(args.projeto);if(!p.ok)return fail(p);return result(true,{project:{id:p.item.id,name:p.item.name},items:listProjectVersions(db,userId,p.item.id)})}
        case 'listar_historico_projeto':{const p=resolveProject(args.projeto);if(!p.ok)return fail(p);return result(true,{project:{id:p.item.id,name:p.item.name},items:listProjectEvents(db,userId,p.item.id,Math.min(100,Math.max(1,Number(args.limite)||30)))})}
        case 'listar_documentos':{
          let rows=listDocs(db,userId);if(args.projeto){const p=resolveProject(args.projeto);if(!p.ok)return fail(p);rows=rows.filter(d=>d.projectId===p.item.id)}return result(true,{items:publicList(rows,50)});
        }
        case 'listar_processamentos_audio':{
          let rows=listJobs(db,userId);if(args.arranjo){const a=resolveArrangement(args.arranjo);if(!a.ok)return fail(a);rows=rows.filter(j=>j.arrangementId===a.item.id)}return result(true,{items:publicList(rows,50)});
        }
        case 'obter_perfil':return result(true,{profile:profile(db.prepare('SELECT * FROM users WHERE id=?').get(userId))});
        case 'abrir_pagina':navigate=args.pagina;return result(true,{navigate,message:`A interface pode abrir ${args.pagina}.`});

        // # CREATE TOOLS ----------------------------------------------------
        case 'propor_criar_cliente':{
          const data=clientSchema.parse({name:args.nome,type:args.tipo||'Pessoa',company:args.empresa||'',email:args.email||'',phone:args.telefone||'',whatsapp:args.whatsapp||'',document:args.documento||'',city:args.cidade||'',notes:args.observacoes||'',status:args.status||'Ativo'});
          if(clients().some(c=>normalize(c.name)===normalize(data.name)))return result(false,{error:'ALREADY_EXISTS',message:`Já existe um cliente chamado “${data.name}”.`});
          const ref=queue({kind:'create-entity',table:'clients',data},[{field:'Novo cliente',from:'—',to:data.name},{field:'Telefone',from:'—',to:data.phone||data.whatsapp||'—'}]);pendingClients.push({name:data.name,ref:ref.ref});
          return result(true,{proposed:true,reference:ref.ref,message:`Cadastro de ${data.name} adicionado à confirmação.`});
        }
        case 'propor_criar_projeto':{
          // # Validação específica antes de resolver relacionamentos
          // Evita mensagens genéricas como "Informe o registro." quando o modelo pequeno
          // esquece de preencher nome/cliente. O usuário recebe exatamente o dado que faltou.
          if(!String(args.nome||'').trim())return result(false,{error:'MISSING_PROJECT_NAME',message:'Informe o nome do novo projeto.'});
          if(!String(args.cliente||'').trim())return result(false,{error:'MISSING_PROJECT_CLIENT',message:'Informe qual cliente deve ser vinculado ao projeto.'});
          let clientId=null,clientRef=null,clientName='';const c=resolveClient(args.cliente);
          if(c.ok){clientId=c.item.id;clientName=c.item.name}else{const pending=pendingClientByName(args.cliente);if(!pending)return fail(c);clientRef=pending.ref;clientName=pending.name}
          let arrangementId='',arrangementName='';if(args.arranjo){const a=resolveArrangement(args.arranjo);if(!a.ok)return fail(a);arrangementId=a.item.id;arrangementName=a.item.title}
          const raw={name:args.nome,clientId:clientId||DUMMY_UUID,arrangementId,description:args.descricao||'',proposal:args.proposta||'',objective:args.objetivo||'',references:args.referencias||'',musicalStyle:args.estilo_musical||'',instruments:args.instrumentos||[],status:args.status||'Proposta',value:Number(args.valor)||0,dueDate:args.prazo||'',paymentDueDate:args.vencimento_pagamento||'',paid:!!args.pago};
          const valid=projectSchema.parse(raw);if(!clientId)delete valid.clientId;
          queue({kind:'create-project',data:valid,clientId,clientRef},[{field:'Novo projeto',from:'—',to:valid.name},{field:'Cliente',from:'—',to:clientName},{field:'Arranjo',from:'—',to:arrangementName||'Não associado'},{field:'Valor',from:'—',to:brl(valid.value)}]);
          return result(true,{proposed:true,message:`Projeto “${valid.name}” adicionado à confirmação.`});
        }

        // # UPDATE TOOLS ----------------------------------------------------
        case 'propor_editar_cliente':{
          const r=resolveClient(args.cliente);if(!r.ok)return fail(r);const map={nome:'name',tipo:'type',empresa:'company',email:'email',telefone:'phone',whatsapp:'whatsapp',documento:'document',cidade:'city',observacoes:'notes',status:'status'},patch=pickDefined(args,map);delete patch.cliente;
          if(!Object.keys(patch).length)return result(false,{error:'NO_CHANGES',message:'Informe pelo menos um campo para alterar.'});
          updateSchema(definitions.clients.schema).parse({...patch,version:r.item.version});queue({kind:'update-entity',table:'clients',entityId:r.item.id,patch,version:r.item.version},previewFor('clients',r.item,patch));return result(true,{proposed:true,message:`Alteração de “${r.item.name}” adicionada à confirmação.`});
        }
        case 'propor_editar_projeto':{
          const r=resolveProject(args.projeto);if(!r.ok)return fail(r);const patch=pickDefined(args,{nome:'name',descricao:'description',proposta:'proposal',objetivo:'objective',referencias:'references',estilo_musical:'musicalStyle',instrumentos:'instruments',status:'status',valor:'value',prazo:'dueDate',vencimento_pagamento:'paymentDueDate',pago:'paid'});
          if(args.cliente!==undefined){const c=resolveClient(args.cliente);if(!c.ok)return fail(c);patch.clientId=c.item.id}
          if(args.arranjo!==undefined){if(args.arranjo==='')patch.arrangementId='';else{const a=resolveArrangement(args.arranjo);if(!a.ok)return fail(a);patch.arrangementId=a.item.id}}
          if(!Object.keys(patch).length)return result(false,{error:'NO_CHANGES',message:'Informe pelo menos um campo para alterar.'});
          updateSchema(definitions.projects.schema).parse({...patch,version:r.item.version});
          const preview=previewFor('projects',r.item,patch).map(p=>{if(p.field.endsWith('Cliente')){const c=clients().find(x=>x.id===patch.clientId);if(c)p.to=c.name}if(p.field.endsWith('Arranjo')){const a=arrangements().find(x=>x.id===patch.arrangementId);p.to=a?.title||'Sem arranjo'}return p});
          queue({kind:'update-entity',table:'projects',entityId:r.item.id,patch,version:r.item.version},preview);return result(true,{proposed:true,message:`Alteração de “${r.item.name}” adicionada à confirmação.`});
        }
        case 'propor_atualizar_pagamento':{
          const r=resolveProject(args.projeto);if(!r.ok)return fail(r);const patch={paid:args.pago};if(args.valor!==undefined)patch.value=args.valor;if(args.vencimento!==undefined)patch.paymentDueDate=args.vencimento;
          updateSchema(definitions.projects.schema).parse({...patch,version:r.item.version});queue({kind:'update-entity',table:'projects',entityId:r.item.id,patch,version:r.item.version},previewFor('projects',r.item,patch));return result(true,{proposed:true,message:`Financeiro de “${r.item.name}” adicionado à confirmação.`});
        }
        case 'propor_editar_arranjo':{
          const r=resolveArrangement(args.arranjo);if(!r.ok)return fail(r);const patch=pickDefined(args,{nome:'title',bpm:'bpm',tonalidade:'key',genero:'genre',instrumentos:'instruments',tags:'tags',observacoes:'notes'});
          if(!Object.keys(patch).length)return result(false,{error:'NO_CHANGES',message:'Informe pelo menos um campo para alterar.'});
          updateSchema(arrangementSchema).parse({...patch,version:r.item.version});queue({kind:'update-entity',table:'arrangements',entityId:r.item.id,patch,version:r.item.version},previewFor('arrangements',r.item,patch));return result(true,{proposed:true,message:`Metadados de “${r.item.title}” adicionados à confirmação.`});
        }
        case 'propor_editar_versao':{
          const p=resolveProject(args.projeto);if(!p.ok)return fail(p);const versions=listProjectVersions(db,userId,p.item.id),v=resolveVersion(versions,args.versao);if(!v.ok)return fail(v);const patch=pickDefined(args,{rotulo:'label',observacoes:'notes',status:'status'});if(!Object.keys(patch).length)return result(false,{error:'NO_CHANGES',message:'Informe pelo menos um campo para alterar.'});
          queue({kind:'update-project-version',projectId:p.item.id,versionId:v.item.id,patch},Object.entries(patch).map(([k,to])=>({field:`Versão V${v.item.number} • ${fieldLabels[k]||k}`,from:display(v.item[k]),to:display(to)})));return result(true,{proposed:true,message:`Alteração da V${v.item.number} adicionada à confirmação.`});
        }
        case 'propor_marcar_versao_enviada':{
          const p=resolveProject(args.projeto);if(!p.ok)return fail(p);const v=resolveVersion(listProjectVersions(db,userId,p.item.id),args.versao);if(!v.ok)return fail(v);if(v.item.sentAt)return result(false,{error:'NO_CHANGES',message:'Essa versão já está marcada como enviada.'});
          queue({kind:'mark-version-sent',projectId:p.item.id,versionId:v.item.id},[{field:`Versão V${v.item.number}`,from:'Não enviada',to:'Enviada ao cliente'}]);return result(true,{proposed:true});
        }
        case 'propor_editar_perfil':{
          const row=db.prepare('SELECT * FROM users WHERE id=?').get(userId),current=profile(row);const patch=pickDefined(args,{nome:'name',empresa:'studio',cargo:'role',telefone:'phone'});if(!Object.keys(patch).length)return result(false,{error:'NO_CHANGES',message:'Informe ao menos um dado do perfil.'});
          queue({kind:'update-profile',patch,version:current.version},Object.entries(patch).map(([k,to])=>({field:`Perfil • ${fieldLabels[k]||({studio:'Empresa/estúdio',role:'Cargo'}[k])||k}`,from:display(current[k]),to:display(to)})));return result(true,{proposed:true});
        }

        // # DELETE TOOLS ----------------------------------------------------
        case 'propor_excluir_cliente':{const r=resolveClient(args.cliente);if(!r.ok)return fail(r);queue({kind:'delete-entity',table:'clients',entityId:r.item.id,version:r.item.version},[{field:'Excluir cliente',from:r.item.name,to:'Excluído'}]);return result(true,{proposed:true})}
        case 'propor_excluir_projeto':{const r=resolveProject(args.projeto);if(!r.ok)return fail(r);queue({kind:'delete-entity',table:'projects',entityId:r.item.id,version:r.item.version},[{field:'Excluir projeto',from:r.item.name,to:'Excluído'}]);return result(true,{proposed:true})}
        case 'propor_excluir_arranjo':{const r=resolveArrangement(args.arranjo);if(!r.ok)return fail(r);queue({kind:'delete-entity',table:'arrangements',entityId:r.item.id,version:r.item.version},[{field:'Excluir arranjo',from:r.item.title,to:'Excluído'}]);return result(true,{proposed:true})}
        case 'propor_excluir_versao':{const p=resolveProject(args.projeto);if(!p.ok)return fail(p);const v=resolveVersion(listProjectVersions(db,userId,p.item.id),args.versao);if(!v.ok)return fail(v);queue({kind:'delete-project-version',projectId:p.item.id,versionId:v.item.id},[{field:'Excluir versão',from:`V${v.item.number} • ${v.item.label}`,to:'Excluída'}]);return result(true,{proposed:true})}
        case 'propor_excluir_documento':{
          const docs=listDocs(db,userId),raw=String(args.documento||'');let d=docs.find(x=>x.id===raw);if(!d){const q=normalize(raw),matches=docs.filter(x=>normalize(x.fileName).includes(q));if(matches.length===1)d=matches[0];else if(matches.length>1)return result(false,{error:'AMBIGUOUS',message:'Há mais de um documento parecido.',candidates:matches.slice(0,5).map(x=>({id:x.id,name:x.fileName}))})}if(!d)return result(false,{error:'NOT_FOUND',message:'Documento não encontrado.'});
          queue({kind:'delete-document',documentId:d.id},[{field:'Excluir documento',from:d.fileName,to:'Excluído'}]);return result(true,{proposed:true});
        }

        // # AUDIO TOOLS -----------------------------------------------------
        case 'propor_iniciar_processamento_audio':{const a=resolveArrangement(args.arranjo);if(!a.ok)return fail(a);queue({kind:'start-audio-job',arrangementId:a.item.id,type:args.tipo},[{field:'Processamento de áudio',from:a.item.title,to:args.tipo}]);return result(true,{proposed:true})}
        case 'propor_cancelar_processamento_audio':{
          const j=listJobs(db,userId).find(x=>x.id===args.processamento);if(!j)return result(false,{error:'NOT_FOUND',message:'Processamento não encontrado.'});queue({kind:'cancel-audio-job',jobId:j.id},[{field:'Processamento',from:j.status,to:'Cancelado'}]);return result(true,{proposed:true});
        }
        case 'propor_excluir_processamento_audio':{
          const j=listJobs(db,userId).find(x=>x.id===args.processamento);if(!j)return result(false,{error:'NOT_FOUND',message:'Processamento não encontrado.'});queue({kind:'delete-audio-job',jobId:j.id},[{field:'Excluir processamento',from:`${j.type} • ${j.status}`,to:'Excluído'}]);return result(true,{proposed:true});
        }
        default:return result(false,{error:'UNKNOWN_TOOL',message:`Tool desconhecida: ${name}`});
      }
    }catch(error){
      return result(false,{error:error.code||error.name||'TOOL_ERROR',message:error.message||'Não foi possível preparar esta ação.'});
    }
  }
  return {execute,operations,changes,get navigate(){return navigate}};
}
