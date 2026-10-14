import { ollamaChat } from './ollama.js';
import { assistantTools,createToolRuntime } from './tools.js';
import { loadAiMessages,saveAiMessage } from './memory.js';
import { saveAssistantProposal } from './actions.js';

function argsOf(call){
  const value=call?.function?.arguments;
  if(value&&typeof value==='object')return value;
  if(typeof value==='string'){try{return JSON.parse(value)}catch{return {}}}
  return {};
}

function normalized(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function selectAgentTools(text,context={}){
  const q=normalized(`${text} ${context.page||''}`);
  const names=new Set(['abrir_pagina']);let matched=false;
  const add=(test,patterns)=>{if(!test)return;matched=true;for(const tool of assistantTools){const name=tool.function.name;if(patterns.some(p=>p.test(name)))names.add(name)}};
  add(/cliente|empresa|telefone|whats|email|cidade/.test(q),[/cliente/]);
  add(/projeto|prazo|entrega|status|revis|produc|conclu|proposta/.test(q),[/projeto/,/versao/,/prazo/,/historico/]);
  add(/arranjo|biblioteca|bpm|tonalidade|instrumento|genero|tag/.test(q),[/arranjo/,/biblioteca_semantica/]);
  add(/finance|recebid|pagamento|pago|pendente|valor|cobran/.test(q),[/financeiro/,/pagamento/,/projeto/]);
  add(/document|nota fiscal|nf\b/.test(q),[/documento/,/projeto/]);
  add(/audio|stems?|midi|partitura|processamento/.test(q),[/processamento_audio/,/arranjo/]);
  add(/perfil|meu nome|meu estudio|meu cargo/.test(q),[/perfil/]);
  add(/alerta|pendencia|atencao/.test(q),[/alerta/,/prazo/,/projeto/]);
  // Se não houver sinal claro, preserva todas as tools para não perder capacidade.
  return matched?assistantTools.filter(tool=>names.has(tool.function.name)):assistantTools;
}

function contextText(context={}){
  const page=String(context.page||'').trim();const projectId=String(context.projectId||'').trim();
  return `Contexto atual da interface: página=${page||'não informada'}${projectId?`, projeto selecionado id=${projectId}`:''}. Quando o usuário disser "este projeto", "aqui" ou algo semelhante, use esse contexto e confirme com tools se necessário.`;
}

// # Prompt do agente operacional
// O ponto central é: o modelo entende linguagem natural, mas dados e efeitos reais só
// entram por tools. Isso impede que uma alucinação vire um UPDATE/DELETE no SQLite.
function systemPrompt(context){return `Você é o Assistente Sonota, agente operacional de uma plataforma de gestão para estúdios musicais.
Responda em português do Brasil, de forma curta e clara.

REGRAS OBRIGATÓRIAS:
1. Para qualquer fato sobre clientes, projetos, arranjos, financeiro, versões, documentos, prazos ou histórico, use uma tool. Nunca invente dados.
2. Para CRIAR, EDITAR ou EXCLUIR dados, use exclusivamente tools cujo nome começa com "propor_". Essas tools NÃO salvam imediatamente: elas montam um card de confirmação.
3. Nunca diga que uma alteração já foi feita antes de o usuário confirmar o card.
4. Você pode criar clientes e projetos; editar/excluir clientes, projetos e arranjos existentes; alterar financeiro; editar/excluir versões/documentos; e operar processamentos de áudio quando houver tool.
5. NUNCA crie um novo arranjo pelo chat. Se pedirem cadastro de arranjo, explique que o arquivo precisa ser enviado pela Biblioteca. Você pode editar detalhes de arranjos já cadastrados.
6. Upload de áudio, nota fiscal, avatar ou nova versão física exige seleção de arquivo na interface. Não finja que enviou um arquivo.
7. Em caso de nomes ambíguos, não escolha sozinho. Use tools de busca e peça ao usuário qual registro ele quer.
8. Você pode executar várias tools na mesma mensagem. Ex.: cadastrar cliente e criar projeto relacionado. As propostas serão confirmadas em lote.
9. Nunca gere nem execute SQL. O backend controla todas as consultas e validações.
10. Se uma tool retornar erro, explique o erro e, quando possível, peça o dado que falta.
11. Para leitura, responda com os dados reais retornados pelas tools. Para escrita, resuma o que ficará pendente de confirmação.

${contextText(context)}`}

export async function runAgent({db,config,userId,text,context={}}){
  const runtime=createToolRuntime({db,config,userId});
  const tools=selectAgentTools(text,context);
  const history=loadAiMessages(db,userId,'assistant',config.aiMemoryMessages).map(m=>({role:m.role,content:m.content}));
  const messages=[{role:'system',content:systemPrompt(context)},...history,{role:'user',content:text}];
  let finalMessage='';

  // # Loop de tool calling
  // O modelo pode consultar vários dados antes de responder. O teto evita loops e custo
  // computacional desnecessário no PC local.
  for(let step=0;step<config.aiMaxSteps;step++){
    const response=await ollamaChat(config,{
      messages,tools,think:false,
      options:{num_ctx:config.aiAgentContext,num_predict:config.aiAgentPredict,temperature:config.aiTemperature},
      keepAlive:config.aiKeepAlive
    });
    const assistant=response.message||{};messages.push(assistant);
    const calls=assistant.tool_calls||[];
    if(!calls.length){finalMessage=String(assistant.content||'').trim();break}
    for(const call of calls){
      const name=call?.function?.name;const result=await runtime.execute(name,argsOf(call));
      messages.push({role:'tool',tool_name:name,content:JSON.stringify(result)});
    }
  }
  if(!finalMessage)finalMessage=runtime.operations.length?'Preparei as alterações solicitadas. Revise o card antes de confirmar.':'Não consegui concluir o raciocínio dentro do limite de etapas. Tente dividir o pedido em uma pergunta menor.';
  const action=runtime.operations.length?saveAssistantProposal(db,userId,runtime.operations,runtime.changes):undefined;
  saveAiMessage(db,userId,'assistant','user',text,{context});saveAiMessage(db,userId,'assistant','assistant',finalMessage,{mode:'agent',hasAction:!!action});
  return {message:finalMessage,action,navigate:runtime.navigate,mode:'agent',model:config.agentModel};
}
