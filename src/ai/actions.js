import { id,now,audit,transaction,listDocs,listJobs } from '../db.js';
import { assert } from '../errors.js';
import { createEntity,updateEntity,owned,versionCheck,entity } from '../entities.js';
import { addProjectEvent,listProjectVersions } from '../workflow.js';

// # Persiste uma proposta de ação por 5 minutos
// O LLM nunca executa CRUD diretamente. Ele apenas produz operations e este módulo grava
// a proposta em assistant_actions para que a interface mostre o card de confirmação.
export function saveAssistantProposal(db,userId,operations,changes){
  assert(Array.isArray(operations)&&operations.length,400,'EMPTY_ACTION','Nenhuma alteração foi proposta.');
  db.prepare('DELETE FROM assistant_actions WHERE expires_at<? OR consumed_at IS NOT NULL').run(Date.now());
  const actionId=id();
  db.prepare('INSERT INTO assistant_actions VALUES (?,?,?,?,NULL)').run(actionId,userId,JSON.stringify({kind:'batch',operations}),Date.now()+5*60000);
  return {id:actionId,entity:operations.length===1?'1 alteração':`${operations.length} alterações`,changes,expiresInSeconds:300,operationCount:operations.length};
}

function resolveRefs(value,created){
  if(typeof value==='string'&&value.startsWith('op:'))return created.get(value)||value;
  if(Array.isArray(value))return value.map(v=>resolveRefs(v,created));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveRefs(v,created)]));
  return value;
}

function deleteEntity(db,userId,op){
  const row=owned(db,op.table,op.entityId,userId);versionCheck(row,op.version);
  if(op.table==='clients'||op.table==='arrangements'){
    const fk=op.table==='clients'?'client_id':'arrangement_id';
    assert(!db.prepare(`SELECT 1 FROM projects WHERE ${fk}=? AND user_id=?`).get(row.id,userId),409,'IN_USE','Registro vinculado a projetos. Altere ou exclua os projetos primeiro.');
  }
  if(op.table==='arrangements')assert(!db.prepare("SELECT 1 FROM jobs WHERE arrangement_id=? AND status IN ('queued','running')").get(row.id),409,'JOB_ACTIVE','Cancele ou aguarde os trabalhos de áudio antes de excluir.');
  db.prepare(`DELETE FROM ${op.table} WHERE id=? AND user_id=?`).run(row.id,userId);audit(db,userId,op.table,row.id,'delete',{source:'assistant'});
  return {type:op.table,id:row.id,deleted:true,collectFiles:op.table!=='clients'};
}

function updateProjectVersion(db,userId,op){
  owned(db,'projects',op.projectId,userId);
  const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(op.versionId,op.projectId,userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
  const allowed={label:'label',notes:'notes',status:'status'},entries=Object.entries(op.patch||{}).filter(([k])=>allowed[k]);assert(entries.length,422,'NO_CHANGES','Nenhuma alteração válida para a versão.');
  db.prepare(`UPDATE project_versions SET ${entries.map(([k])=>`${allowed[k]}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),row.id);
  addProjectEvent(db,userId,row.project_id,'version-updated',`Versão ${row.number} atualizada pelo Assistente.`,{fields:entries.map(([k])=>k),source:'assistant'});audit(db,userId,'project_versions',row.id,'update',{fields:entries.map(([k])=>k),source:'assistant'});
  return listProjectVersions(db,userId,op.projectId).find(v=>v.id===row.id);
}

function markVersionSent(db,userId,op){
  const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(op.versionId,op.projectId,userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
  db.prepare('UPDATE project_versions SET sent_at=? WHERE id=?').run(now(),row.id);addProjectEvent(db,userId,row.project_id,'prototype-sent',`${row.label} marcada como enviada ao cliente pelo Assistente.`,{versionId:row.id,source:'assistant'});audit(db,userId,'project_versions',row.id,'sent',{source:'assistant'});
  return listProjectVersions(db,userId,op.projectId).find(v=>v.id===row.id);
}

function deleteProjectVersion(db,userId,op){
  const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(op.versionId,op.projectId,userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
  db.prepare('DELETE FROM project_versions WHERE id=?').run(row.id);addProjectEvent(db,userId,row.project_id,'version-deleted',`Versão ${row.number} removida pelo Assistente.`,{source:'assistant'});audit(db,userId,'project_versions',row.id,'delete',{source:'assistant'});
  return {id:row.id,deleted:true,collectFiles:true};
}

function deleteDocument(db,userId,op){
  const doc=db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').get(op.documentId,userId);assert(doc,404,'NOT_FOUND','Documento não encontrado.');
  db.prepare('DELETE FROM docs WHERE id=?').run(doc.id);db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(),doc.project_id);addProjectEvent(db,userId,doc.project_id,'document-deleted','Documento financeiro removido pelo Assistente.',{documentId:doc.id,source:'assistant'});audit(db,userId,'docs',doc.id,'delete',{source:'assistant'});
  return {id:doc.id,deleted:true,collectFiles:true};
}

function updateProfile(db,userId,op){
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(userId);versionCheck(user,op.version);
  const patch=op.patch||{},map={name:'name',studio:'studio',role:'role',phone:'phone'},entries=Object.entries(patch).filter(([k])=>map[k]);assert(entries.length,422,'NO_CHANGES','Nenhuma alteração válida no perfil.');
  db.prepare(`UPDATE users SET ${entries.map(([k])=>`${map[k]}=?`).join(',')},version=version+1,updated_at=? WHERE id=? AND version=?`).run(...entries.map(([,v])=>v),now(),userId,user.version);
  audit(db,userId,'users',userId,'profile_update',{fields:entries.map(([k])=>k),source:'assistant'});return {id:userId,updated:true};
}

// # Confirma uma proposta inteira, inclusive operações dependentes
// Ex.: op:0 cria um cliente e op:1 cria um projeto usando o ID gerado em op:0.
// Tudo fica na mesma transação: ou todas as alterações de banco entram, ou nenhuma entra.
export async function confirmAssistantProposal({db,userId,actionId,worker,files}){
  let needCollect=false;
  const outputs=transaction(db,()=>{
    const action=db.prepare('SELECT * FROM assistant_actions WHERE id=? AND user_id=?').get(actionId,userId);
    assert(action&&!action.consumed_at&&action.expires_at>Date.now(),409,'ACTION_EXPIRED','A proposta expirou ou já foi utilizada. Envie o comando novamente.');
    const payload=JSON.parse(action.payload);
    // # Compatibilidade com o Assistente legado
    // Se o Ollama estiver fora do ar, assistant-legacy.js ainda pode gerar os formatos
    // antigos create-project/update. Eles continuam confirmáveis na mesma rota.
    if(payload.kind==='create-project'){
      const projectId=createEntity(db,'projects',payload.data,userId);
      db.prepare('UPDATE assistant_actions SET consumed_at=? WHERE id=?').run(now(),action.id);
      return [entity(db,'projects',projectId,userId)];
    }
    if(payload.kind==='update'){
      const output=updateEntity(db,payload.table,payload.entityId,{...payload.patch,version:payload.version},userId,{},'assistant');
      db.prepare('UPDATE assistant_actions SET consumed_at=? WHERE id=?').run(now(),action.id);
      return [output];
    }
    assert(payload.kind==='batch'&&Array.isArray(payload.operations),400,'INVALID_ACTION','Proposta inválida.');
    const created=new Map(),results=[];
    payload.operations.forEach((rawOp,index)=>{
      const op=resolveRefs(rawOp,created);let output;
      switch(op.kind){
        case 'create-entity':{
          const entityId=createEntity(db,op.table,op.data,userId);created.set(`op:${index}`,entityId);output=entity(db,op.table,entityId,userId);break;
        }
        case 'create-project':{
          const clientId=op.clientId||resolveRefs(op.clientRef,created);assert(clientId&&!String(clientId).startsWith('op:'),409,'DEPENDENCY_NOT_READY','O cliente necessário para criar o projeto não foi criado.');
          const data={...op.data,clientId};const projectId=createEntity(db,'projects',data,userId);created.set(`op:${index}`,projectId);output=entity(db,'projects',projectId,userId);break;
        }
        case 'update-entity':output=updateEntity(db,op.table,op.entityId,{...op.patch,version:op.version},userId,{},'assistant');break;
        case 'delete-entity':output=deleteEntity(db,userId,op);needCollect ||= !!output.collectFiles;break;
        case 'update-project-version':output=updateProjectVersion(db,userId,op);break;
        case 'mark-version-sent':output=markVersionSent(db,userId,op);break;
        case 'delete-project-version':output=deleteProjectVersion(db,userId,op);needCollect=true;break;
        case 'delete-document':output=deleteDocument(db,userId,op);needCollect=true;break;
        case 'update-profile':output=updateProfile(db,userId,op);break;
        case 'start-audio-job':{const jobId=worker.enqueue(userId,op.arrangementId,op.type);output=listJobs(db,userId).find(j=>j.id===jobId);break;}
        case 'cancel-audio-job':worker.cancel(userId,op.jobId);output=listJobs(db,userId).find(j=>j.id===op.jobId);break;
        case 'delete-audio-job':{
          const job=db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(op.jobId,userId);assert(job,404,'NOT_FOUND','Trabalho não encontrado.');assert(!['queued','running'].includes(job.status),409,'JOB_ACTIVE','Cancele ou aguarde o trabalho antes de excluir.');db.prepare('DELETE FROM jobs WHERE id=?').run(job.id);audit(db,userId,'jobs',job.id,'delete',{source:'assistant'});output={id:job.id,deleted:true};needCollect=true;break;
        }
        default:throw new Error(`Ação não suportada: ${op.kind}`);
      }
      results.push(output);
    });
    db.prepare('UPDATE assistant_actions SET consumed_at=? WHERE id=?').run(now(),action.id);return results;
  });
  if(needCollect)await files.collect(userId);
  return {message:outputs.length===1?'Alteração salva.':`${outputs.length} alterações salvas.`,records:outputs};
}
