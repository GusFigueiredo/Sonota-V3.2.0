import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { createToolRuntime } from '../src/ai/tools.js';
import { saveAssistantProposal,confirmAssistantProposal } from '../src/ai/actions.js';
import { applyCloudProfileProposal } from '../src/firebase-account-profile.js';

test('IA V3.2: lê e edita perfil Firebase sem criar usuário local; repetição é idempotente',async t=>{
 const docs=new Map([['usuarios/cloud-user',{name:'Pessoa',studio:'Estúdio',role:'Músico',phone:'',version:1}]]);
 const ref=key=>({get:async()=>({exists:docs.has(key),data:()=>docs.get(key)}),collection:name=>({doc:id=>ref(key+'/'+name+'/'+id)}),key});
 const firestore={collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,data,options)=>docs.set(r.key,options?.merge?{...docs.get(r.key),...data}:data)})};
 const r=await fixture(t,{firebaseOnly:true,cloudServices:{firestore}});
 r.db.prepare('INSERT INTO owners(id,firebase_uid) VALUES (?,?)').run('cloud-user','cloud-user');
 const runtime=createToolRuntime({db:r.db,config:r.config,userId:'cloud-user'});
 const read=await runtime.execute('obter_perfil');
 assert.ok(JSON.stringify(read).includes('Estúdio'));
 await runtime.execute('propor_editar_perfil',{nome:'Pessoa atualizada'});
 assert.equal(runtime.operations.length,1);
 const action=saveAssistantProposal(r.db,'cloud-user',runtime.operations,runtime.changes);
 await confirmAssistantProposal({db:r.db,config:r.config,userId:'cloud-user',actionId:action.id});
 assert.equal(docs.get('usuarios/cloud-user').name,'Pessoa atualizada');
 assert.equal(docs.get('usuarios/cloud-user').version,2);
 await applyCloudProfileProposal(r.db,r.config,'cloud-user',action.id,runtime.operations[0]);
 assert.equal(docs.get('usuarios/cloud-user').version,2);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM users').get().n,0);
});
