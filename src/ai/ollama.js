// # Cliente HTTP mínimo para Ollama
// O backend usa fetch nativo do Node. Não há SDK externo nem API paga.
// Nesta versão o mesmo cliente atende três perfis diferentes:
// 1) FAST: modelo pequeno para entender CRUD/consultas simples;
// 2) AGENT: o mesmo Qwen 1.7B em um perfil com tools para pedidos complexos;
// 3) EMBEDDING: modelo pequeno especializado em significado/busca semântica.

function baseUrl(config){return String(config.ollamaUrl||'').replace(/\/$/,'')}
function assertConfigured(config){if(!config.aiEnabled||!baseUrl(config))throw new Error('OLLAMA_NOT_CONFIGURED')}

// # Chat configurável e otimizado
// keep_alive evita recarregar o modelo a cada mensagem. options permite reduzir contexto,
// temperatura e número de tokens, que são os principais ganhos de velocidade no Sonota.
export async function ollamaChat(config,{messages,tools,format,model=config.agentModel,think=false,timeoutMs=config.aiTimeoutMs,options={},keepAlive=config.aiKeepAlive}){
  assertConfigured(config);
  const body={model,messages,stream:false,think,keep_alive:keepAlive};
  if(tools?.length)body.tools=tools;
  if(format)body.format=format;
  if(options&&Object.keys(options).length)body.options=options;
  const response=await fetch(`${baseUrl(config)}/api/chat`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok){
    let detail='';try{detail=(await response.text()).slice(0,500)}catch{}
    throw new Error(`OLLAMA_CHAT_${response.status}${detail?`:${detail}`:''}`);
  }
  const data=await response.json();
  if(!data?.message)throw new Error('OLLAMA_INVALID_CHAT_RESPONSE');
  return data;
}

// # Embeddings locais
// O modelo de embeddings é separado do modelo de conversa. Ele é especializado em
// representar significado e é usado no ranking semântico dos arranjos.
export async function ollamaEmbed(config,texts,{timeoutMs=config.aiTimeoutMs}={}){
  if(!baseUrl(config))throw new Error('OLLAMA_NOT_CONFIGURED');
  const response=await fetch(`${baseUrl(config)}/api/embed`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:config.embeddingModel,input:texts,truncate:true,keep_alive:config.aiKeepAlive}),
    signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok)throw new Error(`OLLAMA_EMBED_${response.status}`);
  const data=await response.json();
  if(!Array.isArray(data.embeddings)||data.embeddings.length!==texts.length||data.embeddings.some(v=>!Array.isArray(v)||!v.length||v.some(n=>!Number.isFinite(n))))throw new Error('OLLAMA_INVALID_EMBEDDINGS');
  return data.embeddings;
}

// # Aquecimento do modelo rápido
// O primeiro uso de um modelo local é o mais lento porque ele precisa ser carregado na RAM/GPU.
// Esta chamada gera praticamente nada; serve apenas para deixar o modelo FAST pronto antes
// de o usuário abrir o chat. Na V3.2.0 o mesmo modelo 1.7B atende FAST e AGENT,
// reduzindo RAM, disco e o custo de troca entre modelos.
export async function warmupModel(config,model=config.aiFastModel){
  if(!config.aiEnabled||!baseUrl(config)||!model)return {ok:false,reason:'disabled'};
  const started=Date.now();
  try{
    await ollamaChat(config,{
      model,think:false,timeoutMs:config.aiWarmupTimeoutMs,
      messages:[{role:'user',content:'Responda somente OK.'}],
      options:{num_ctx:512,num_predict:2,temperature:0},
      keepAlive:config.aiKeepAlive
    });
    return {ok:true,model,ms:Date.now()-started};
  }catch(error){return {ok:false,model,ms:Date.now()-started,error:error.message}}
}


// # Aquecimento do modelo de embeddings
// Faz uma única vetorização curta para tirar o custo de carregamento da primeira busca.
export async function warmupEmbedding(config){
  if(!config.aiEnabled||!baseUrl(config)||!config.embeddingModel)return {ok:false,reason:'disabled'};
  const started=Date.now();
  try{
    await ollamaEmbed(config,['sonota'],{timeoutMs:config.aiWarmupTimeoutMs});
    return {ok:true,model:config.embeddingModel,ms:Date.now()-started};
  }catch(error){return {ok:false,model:config.embeddingModel,ms:Date.now()-started,error:error.message}}
}

// # Verificação rápida para a interface/capabilities
export async function ollamaStatus(config){
  if(!config.aiEnabled||!baseUrl(config))return {enabled:false,available:false};
  try{
    const response=await fetch(`${baseUrl(config)}/api/tags`,{signal:AbortSignal.timeout(Math.min(config.aiTimeoutMs,2500))});
    if(!response.ok)return {enabled:true,available:false};
    const data=await response.json();
    const models=(data.models||[]).map(m=>m.name||m.model).filter(Boolean);
    return {
      enabled:true,available:true,models,
      fastEnabled:config.aiFastEnabled,fastModel:config.aiFastModel,
      agentModel:config.agentModel,embeddingModel:config.embeddingModel,
      keepAlive:config.aiKeepAlive
    };
  }catch{return {enabled:true,available:false,fastModel:config.aiFastModel,agentModel:config.agentModel,embeddingModel:config.embeddingModel}}
}
