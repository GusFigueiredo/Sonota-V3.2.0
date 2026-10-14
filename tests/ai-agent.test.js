import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fixture,account,call,seed,multipart } from './helpers.js';

function ollamaMock(handler){
  return createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{},output=await handler(req.url,body);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(output));
  });
}
function listen(server){return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)))}

test('agente Ollama propõe e confirma edição usando tool calling',async t=>{
  let calls=0;const service=ollamaMock((url,body)=>{
    assert.equal(url,'/api/chat');assert.equal(body.model,'test-agent');calls++;
    if(calls===1)return {message:{role:'assistant',content:'',tool_calls:[{type:'function',function:{name:'propor_editar_projeto',arguments:{projeto:'Campanha Aurora',status:'Concluído'}}}]}};
    return {message:{role:'assistant',content:'Preparei a mudança de etapa. Revise antes de confirmar.'}};
  });
  const url=await listen(service);t.after(()=>new Promise(r=>service.close(r)));
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:url,agentModel:'test-agent',aiFastEnabled:false}),u=await account(runtime.base),{project}=await seed(runtime.base,u);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'fecha a campanha da aurora',context:{page:'projetos'}});
  assert.equal(response.status,200);assert.equal(response.data.mode,'agent');assert.ok(response.data.action);assert.equal((await call(runtime.base,u,'GET','/projects/'+project.id)).data.status,'Em produção');
  const confirmed=await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');assert.equal(confirmed.status,200);assert.equal((await call(runtime.base,u,'GET','/projects/'+project.id)).data.status,'Concluído');
});

test('agente confirma em lote cliente novo + projeto relacionado',async t=>{
  let calls=0;const service=ollamaMock((url,body)=>{
    assert.equal(url,'/api/chat');calls++;
    if(calls===1)return {message:{role:'assistant',content:'',tool_calls:[
      {type:'function',function:{name:'propor_criar_cliente',arguments:{nome:'Lucas Studio',telefone:'11999999999'}}},
      {type:'function',function:{name:'propor_criar_projeto',arguments:{nome:'Comercial Porsche',cliente:'Lucas Studio',arranjo:'Theme Aurora',valor:6000}}}
    ]}};
    return {message:{role:'assistant',content:'Preparei o cliente e o projeto em uma única confirmação.'}};
  });
  const url=await listen(service);t.after(()=>new Promise(r=>service.close(r)));
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:url,agentModel:'test-agent',aiFastEnabled:false}),u=await account(runtime.base);await seed(runtime.base,u);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'cadastre Lucas Studio e crie Comercial Porsche para ele usando Theme Aurora por 6 mil'});
  assert.equal(response.status,200);assert.equal(response.data.action.operationCount,2);
  const confirmed=await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');assert.equal(confirmed.status,200);assert.equal(confirmed.data.records.length,2);
  const clients=(await call(runtime.base,u,'GET','/clients')).data.items,projects=(await call(runtime.base,u,'GET','/projects')).data.items;
  const client=clients.find(c=>c.name==='Lucas Studio'),project=projects.find(p=>p.name==='Comercial Porsche');assert.ok(client);assert.ok(project);assert.equal(project.clientId,client.id);assert.equal(project.value,6000);
});

test('Busca Inteligente usa planejador Qwen + embeddings quando IA local está ativa',async t=>{
  let chatCalls=0,embedCalls=0;const service=ollamaMock((url,body)=>{
    if(url==='/api/embed'){embedCalls++;return {embeddings:body.input.map((text)=>normalizeVector(text))}}
    assert.equal(url,'/api/chat');chatCalls++;
    if(body.format)return {message:{role:'assistant',content:JSON.stringify({minBpm:120,maxBpm:130,key:'',genre:'',instruments:['synth'],tags:[],excluded:[],terms:['synth'],semanticQuery:'futurista tecnologia'})}};
    return {message:{role:'assistant',content:'Encontrei um arranjo compatível com BPM, synth e clima futurista.'}};
  });
  function normalizeVector(text){const q=String(text).toLowerCase();return q.includes('futur')||q.includes('synth')?[1,0,0]:[0,1,0]}
  const url=await listen(service);t.after(()=>new Promise(r=>service.close(r)));
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:url,agentModel:'test-agent',aiFastModel:'test-fast',embeddingModel:'test-embedding'}),u=await account(runtime.base);await seed(runtime.base,u);
  const response=await call(runtime.base,u,'POST','/search',{query:'agora quero algo mais futurista entre 120 e 130 BPM com synth',limit:10});
  assert.equal(response.status,200);assert.equal(response.data.criteria.planner,'ollama');assert.equal(response.data.mode,'hybrid');assert.equal(response.data.total,1);assert.match(response.data.answer,/Encontrei/);assert.equal(chatCalls,1);assert.ok(embedCalls>=2);
});


test('modo FAST prepara CRUD simples em uma única inferência e sem segunda resposta do LLM',async t=>{
  let calls=0;const service=ollamaMock((url,body)=>{
    assert.equal(url,'/api/chat');calls++;
    assert.equal(body.model,'test-fast');assert.equal(body.think,false);assert.equal(body.keep_alive,'1h');
    assert.equal(body.options.num_predict,192);
    return {message:{role:'assistant',content:JSON.stringify({mode:'fast',calls:[{tool:'propor_criar_cliente',args:{nome:'Alfredo Cherra Mal',telefone:'11999999999'}}]})}};
  });
  const url=await listen(service);t.after(()=>new Promise(r=>service.close(r)));
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:url,aiFastEnabled:true,aiFastModel:'test-fast',agentModel:'test-agent'}),u=await account(runtime.base);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'cria um cliente chamado Alfredo Cherra Mal telefone 11999999999'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.ok(response.data.action);assert.equal(calls,1);
  const before=(await call(runtime.base,u,'GET','/clients')).data.items;assert.equal(before.some(x=>x.name==='Alfredo Cherra Mal'),false);
  await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  const after=(await call(runtime.base,u,'GET','/clients')).data.items;assert.equal(after.some(x=>x.name==='Alfredo Cherra Mal'),true);
});

test('saudação é instantânea e não chama Ollama',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1'}),u=await account(runtime.base);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'oi'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'instant');assert.match(response.data.message,/Olá/);
});

test('modo FAST responde resumo financeiro sem segunda inferência',async t=>{
  let calls=0;const service=ollamaMock(()=>{calls++;return {message:{role:'assistant',content:JSON.stringify({mode:'fast',calls:[{tool:'resumo_financeiro',args:{}}]})}}});
  const url=await listen(service);t.after(()=>new Promise(r=>service.close(r)));
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:url,aiFastEnabled:true,aiFastModel:'test-fast'}),u=await account(runtime.base);await seed(runtime.base,u);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'quanto tenho para receber?'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.equal(calls,1);assert.match(response.data.message,/A receber/);
});


test('modo FAST entende adicionar telefone ao cliente existente como edição',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base);
  await call(runtime.base,u,'POST','/clients',{name:'Alfredo PCD',type:'Pessoa'});
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'adicionar o telefone: 1196969969 ao cliente Alfredo PCD'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.ok(response.data.action);
  await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  const clients=(await call(runtime.base,u,'GET','/clients')).data.items;
  const alfredo=clients.find(x=>x.name==='Alfredo PCD');assert.ok(alfredo);assert.equal(alfredo.phone,'1196969969');
});

test('modo FAST cria projeto por frase natural resolvendo cliente e arranjo por nome',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base);
  const client=(await call(runtime.base,u,'POST','/clients',{name:'Alfredo PCD',type:'Pessoa'})).data;
  const arrangement=(await call(runtime.base,u,'POST','/arrangements',multipart({title:'pokemon',bpm:120,key:'C',genre:'Game',instruments:['synth'],tags:['pokemon']}))).data;
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'criar um projeto chamado musica pokemon, para o cliente alfredo pcc com o arranjo pokemon custando 10 reais'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.ok(response.data.action);
  await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  const projects=(await call(runtime.base,u,'GET','/projects')).data.items;
  const project=projects.find(x=>x.name==='musica pokemon');assert.ok(project);assert.equal(project.clientId,client.id);assert.equal(project.arrangementId,arrangement.id);assert.equal(project.value,10);assert.equal(project.status,'Proposta');
});


test('V2.6.2 exclui cliente por comando determinístico sem chamar Ollama',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base);
  const client=(await call(runtime.base,u,'POST','/clients',{name:'Cliente Temporário',type:'Pessoa'})).data;
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'excluir o cliente Cliente Temporário'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.equal(response.data.model,'local-fast-parser');assert.ok(response.data.action);
  assert.ok((await call(runtime.base,u,'GET','/clients')).data.items.some(x=>x.id===client.id));
  const confirmed=await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  assert.equal(confirmed.status,200);
  assert.equal((await call(runtime.base,u,'GET','/clients')).data.items.some(x=>x.id===client.id),false);
});

test('V2.6.2 exclui projeto por comando determinístico sem chamar Ollama',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base),{project}=await seed(runtime.base,u);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'apaga o projeto Campanha Aurora'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.equal(response.data.model,'local-fast-parser');assert.ok(response.data.action);
  const confirmed=await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  assert.equal(confirmed.status,200);
  assert.equal((await call(runtime.base,u,'GET','/projects')).data.items.some(x=>x.id===project.id),false);
});

test('V2.6.2 exclui arranjo livre por comando determinístico sem chamar Ollama',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base);
  const arr=(await call(runtime.base,u,'POST','/arrangements',multipart({title:'Arranjo Temporário',bpm:100,key:'C',genre:'Teste',instruments:['piano'],tags:['teste']}))).data;
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'remove o arranjo Arranjo Temporário'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.equal(response.data.model,'local-fast-parser');assert.ok(response.data.action);
  const confirmed=await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  assert.equal(confirmed.status,200);
  assert.equal((await call(runtime.base,u,'GET','/arrangements')).data.items.some(x=>x.id===arr.id),false);
});

test('V2.6.2 muda status para concluído sem chamar Ollama e mantém integração do projeto',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base),{project}=await seed(runtime.base,u);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'muda Campanha Aurora para concluído'});
  assert.equal(response.status,200);assert.equal(response.data.mode,'fast');assert.equal(response.data.model,'local-fast-parser');assert.ok(response.data.action);
  assert.equal((await call(runtime.base,u,'GET','/projects/'+project.id)).data.status,'Em produção');
  const confirmed=await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  assert.equal(confirmed.status,200);
  const updated=(await call(runtime.base,u,'GET','/projects/'+project.id)).data;
  assert.equal(updated.status,'Concluído');
});

test('V2.6.2 entende finalizar e cancelar projeto sem inferência',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base),{project}=await seed(runtime.base,u);
  let response=await call(runtime.base,u,'POST','/assistant/message',{message:'finaliza o projeto Campanha Aurora'});
  assert.equal(response.status,200);assert.equal(response.data.model,'local-fast-parser');assert.ok(response.data.action);
  await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  assert.equal((await call(runtime.base,u,'GET','/projects/'+project.id)).data.status,'Concluído');

  response=await call(runtime.base,u,'POST','/assistant/message',{message:'cancela o projeto Campanha Aurora'});
  assert.equal(response.status,200);assert.equal(response.data.model,'local-fast-parser');assert.ok(response.data.action);
  await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  assert.equal((await call(runtime.base,u,'GET','/projects/'+project.id)).data.status,'Cancelado');
});

test('V2.6.2 marca pagamento recebido sem chamar Ollama',async t=>{
  const runtime=await fixture(t,{aiEnabled:true,ollamaUrl:'http://127.0.0.1:1',aiFastEnabled:true}),u=await account(runtime.base),{project}=await seed(runtime.base,u);
  const response=await call(runtime.base,u,'POST','/assistant/message',{message:'marca o pagamento do projeto Campanha Aurora como recebido'});
  assert.equal(response.status,200);assert.equal(response.data.model,'local-fast-parser');assert.ok(response.data.action);
  await call(runtime.base,u,'POST','/assistant/actions/'+response.data.action.id+'/confirm');
  assert.equal((await call(runtime.base,u,'GET','/projects/'+project.id)).data.paid,true);
});
