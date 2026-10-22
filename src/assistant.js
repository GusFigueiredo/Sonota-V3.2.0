import { runAgent } from './ai/agent.js';
import { runFast,isGreeting } from './ai/fast.js';
import { interpret as legacyInterpret } from './assistant-legacy.js';
import { saveAiMessage } from './ai/memory.js';

// # Porta de entrada do Assistente V2.6
// Ordem de prioridade:
// 1) saudações locais: resposta instantânea, sem carregar modelo;
// 2) FAST: modelo pequeno + JSON estruturado para CRUD/consultas simples;
// 3) AGENT: o mesmo Qwen 1.7B, com tools selecionadas apenas para pedidos complexos;
// 4) fallback legado se o Ollama estiver indisponível.
export async function interpret(db,config,userId,text,context={}){
  if(isGreeting(text)){
    const message='Olá! Posso consultar dados do Sonota ou preparar criações, alterações e exclusões para sua confirmação.';
    saveAiMessage(db,userId,'assistant','user',text,{context,mode:'instant'});
    saveAiMessage(db,userId,'assistant','assistant',message,{mode:'instant'});
    return {message,mode:'instant'};
  }

  if(config.aiEnabled&&config.ollamaUrl){
    // # Primeiro tentamos o caminho rápido
    // Uma ação simples não precisa abrir o loop de tools do agente.
    if(config.aiFastEnabled){
      try{
        const fast=await runFast({db,config,userId,text,context});
        if(fast.handled)return fast.response;
      }catch(error){
        // Evita que um timeout de 60–90 s seja seguido por outro de até 180 s.
        // Em falha técnica do modo rápido, resposta local imediata e transparente.
        console.warn('[sonota-ai] Modo rápido indisponível; usando compatibilidade:',error.message);
        const fallback=legacyInterpret(db,userId,text);
        const message=`${fallback.message}${fallback.action?'':'\n\n(A IA local demorou ou ficou indisponível; resultado produzido pelo modo compatível.)'}`;
        saveAiMessage(db,userId,'assistant','user',text,{context,fallback:true});
        saveAiMessage(db,userId,'assistant','assistant',message,{mode:'fallback'});
        return {...fallback,message,mode:'fallback',notice:'Tempo de resposta excedido no modo rápido. O Sonota usou o modo compatível.'};
      }
    }

    try{return await runAgent({db,config,userId,text,context})}
    catch(error){
      console.warn('[sonota-ai] Agente local indisponível, usando fallback:',error.message);
      const fallback=legacyInterpret(db,userId,text);
      const message=`${fallback.message}${fallback.action?'':'\n\n(IA local indisponível; resposta gerada pelo modo compatível.)'}`;
      saveAiMessage(db,userId,'assistant','user',text,{context,fallback:true});saveAiMessage(db,userId,'assistant','assistant',message,{mode:'fallback'});
      return {...fallback,message,mode:'fallback',notice:'Ollama indisponível. O Sonota usou o interpretador compatível.'};
    }
  }
  const fallback=legacyInterpret(db,userId,text);return {...fallback,mode:'fallback'};
}
