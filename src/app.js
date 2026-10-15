import express from 'express';
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { acquireLock } from './lock.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { getConfig, ROOT } from './config.js';
import { openDatabase,transaction,id,now,audit,profile,listClients,listArrangements,listProjects,listDocs,listJobs,financeSummary,projectActivity } from './db.js';
import { AppError,assert } from './errors.js';
import { hashPassword,verifyPassword,createSession,cookieOptions,requireAuth,originGuard,readSession } from './auth.js';
import { registerSchema,loginSchema,profileSchema,arrangementSchema,docSchema,financeSchema,projectVersionSchema,searchSchema,jobSchema,messageSchema } from './validation.js';
import { definitions,owned,versionCheck,createEntity,updateEntity,entity } from './entities.js';
import { storage } from './files.js';
import { search,normalize,indexArrangement,primeLibraryIndex,removeArrangementIndex } from './search.js';
import { interpret } from './assistant.js';
import { confirmAssistantProposal } from './ai/actions.js';
import { ollamaStatus } from './ai/ollama.js';
import { createWorker } from './jobs.js';
import { cloudAccounts } from './cloud-accounts.js';
import { addProjectEvent,listProjectEvents,listProjectVersions,studioFlow,operationalAlerts,upcomingDeliveries } from './workflow.js';

function metadata(req) {
  if(req.is('multipart/form-data')){
    assert(typeof req.body?.metadata==='string',400,'METADATA_REQUIRED','Envie os metadados do arquivo.');
    try{return JSON.parse(req.body.metadata);}catch{throw new AppError(400,'INVALID_JSON','Metadados JSON inválidos.');}
  }
  return req.body;
}

function isLoopbackRequest(req) {
  const address=String(req.socket?.remoteAddress||'').toLowerCase();
  return address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';
}
function launchDetached(command,args=[],options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true,...options});
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve();});
  });
}
function revealFileInSystem(filePath) {
  if(process.platform==='win32') return launchDetached('explorer.exe',[`/select,${filePath}`]);
  if(process.platform==='darwin') return launchDetached('open',['-R',filePath]);
  return launchDetached('xdg-open',[path.dirname(filePath)]);
}
function openFileInSystem(filePath) {
  if(process.platform==='win32') return launchDetached('powershell.exe',['-NoProfile','-WindowStyle','Hidden','-Command','Start-Process -FilePath $env:SONOTA_FILE_PATH'],{env:{...process.env,SONOTA_FILE_PATH:filePath}});
  if(process.platform==='darwin') return launchDetached('open',[filePath]);
  return launchDetached('xdg-open',[filePath]);
}
async function copyToDownloads(file) {
  const home=process.env.USERPROFILE||process.env.HOME||process.cwd();
  const folder=path.join(home,'Downloads','Sonota');
  await mkdir(folder,{recursive:true});
  const ext=path.extname(file.original_name||file.storage_name);
  const base=path.basename(file.original_name||file.storage_name,ext);
  let target=path.join(folder,`${base}${ext}`),i=2;
  while(existsSync(target))target=path.join(folder,`${base} (${i++})${ext}`);
  await copyFile(file.path,target);
  return target;
}

function pagination(req,items){
  const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
  assert(Number.isInteger(page)&&Number.isInteger(limit),400,'INVALID_PAGE','Paginação inválida.');
  return {items:items.slice((page-1)*limit,page*limit),total:items.length,page,limit};
}
export function createApp(overrides={}) {
  const config=getConfig(overrides),release=acquireLock(config);
  let db;try{db=openDatabase(config);}catch(error){release();throw error;}
  const files=storage(config,db),worker=createWorker(db,config,files),app=express();
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{'default-src':["'self'"],'script-src':["'self'"],'script-src-attr':["'none'"],'style-src':["'self'","'unsafe-inline'"],'img-src':["'self'",'data:'],'media-src':["'self'",'blob:'],'connect-src':["'self'",'https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com'],'upgrade-insecure-requests':config.secureCookie?[]:null}},strictTransportSecurity:config.secureCookie?undefined:false}));
  app.use('/api',originGuard(config),(req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use('/api',rateLimit({windowMs:15*60000,limit:1800,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'Muitas requisições. Aguarde alguns minutos.'}}}));
  app.use(express.json({limit:'150kb',strict:true}));
  const loginLimiter=rateLimit({windowMs:15*60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'Muitas tentativas de acesso. Aguarde 15 minutos.'}}});
  app.get('/api/health',(req,res)=>res.json({status:'ok',version:'3.2.0'}));
  if(config.firebaseOnly) app.use('/api',cloudAccounts(db,config,loginLimiter,files));
  app.get('/api/auth/options',(req,res)=>res.json({registration:config.registration}));
  app.post('/api/auth/register',loginLimiter,async(req,res)=>{
    assert(config.registration,403,'REGISTRATION_DISABLED','Cadastro de novas contas desativado.');
    const data=registerSchema.parse(req.body),passwordHash=await hashPassword(data.password),userId=id(),time=now();
    transaction(db,()=>{
      assert(!db.prepare('SELECT 1 FROM users WHERE email=?').get(data.email),409,'EMAIL_EXISTS','Este e-mail já possui uma conta.');
      db.prepare('INSERT INTO users(id,email,password_hash,name,role,studio,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(userId,data.email,passwordHash,data.name,data.role,data.studio,time,time);
      audit(db,userId,'users',userId,'register');
    });
    const csrf=createSession(db,config,userId,res);res.status(201).json({user:profile(db.prepare('SELECT * FROM users WHERE id=?').get(userId)),csrf});
  });
  app.post('/api/auth/login',loginLimiter,async(req,res)=>{
    const data=loginSchema.parse(req.body),user=db.prepare('SELECT * FROM users WHERE email=?').get(data.email);
    assert(await verifyPassword(data.password,user?.password_hash),401,'INVALID_CREDENTIALS','E-mail ou senha incorretos.');
    const old=readSession(db,req);if(old)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(old.token_hash);
    const csrf=createSession(db,config,user.id,res);res.json({user:profile(user),csrf});
  });
  app.use('/api',(req,res,next)=>config.firebaseOnly?next():requireAuth(db)(req,res,next));
  app.post('/api/auth/logout',(req,res)=>{
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);res.clearCookie('sonota_session',cookieOptions(config));res.sendStatus(204);
  });
  app.get('/api/auth/me',(req,res)=>res.json({user:profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)),csrf:req.session.csrf}));
  app.patch('/api/profile',async(req,res)=>{
    const data=profileSchema.parse(req.body),user=db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
    if(user.email!==data.email)assert(await verifyPassword(data.currentPassword||'',user.password_hash),403,'PASSWORD_REQUIRED','Confirme sua senha atual para alterar o e-mail.');
    transaction(db,()=>{
      versionCheck(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId),data.version);
      assert(!db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(data.email,req.userId),409,'EMAIL_EXISTS','Este e-mail já está em uso.');
      db.prepare('UPDATE users SET name=?,role=?,studio=?,email=?,phone=?,notification_preferences=?,version=version+1,updated_at=? WHERE id=?').run(data.name,data.role,data.studio,data.email,data.phone,JSON.stringify(data.notificationPreferences),now(),req.userId);
      audit(db,req.userId,'users',req.userId,'profile_update');
    });res.json(profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)));
  });
  app.post('/api/profile/avatar',files.middleware,async(req,res)=>{
    const file=await files.stage(req,'document',{category:'perfil'});assert(file.mime.startsWith('image/'),415,'IMAGE_REQUIRED','Use uma imagem PNG ou JPG para a foto do perfil.');
    transaction(db,()=>{files.insert(file);db.prepare('UPDATE users SET avatar_file_id=?,version=version+1,updated_at=? WHERE id=?').run(file.id,now(),req.userId);audit(db,req.userId,'users',req.userId,'avatar_update');});
    file.committed=true;await files.collect(req.userId);res.json(profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)));
  });
  app.delete('/api/profile/avatar',async(req,res)=>{
    transaction(db,()=>{db.prepare('UPDATE users SET avatar_file_id=NULL,version=version+1,updated_at=? WHERE id=?').run(now(),req.userId);audit(db,req.userId,'users',req.userId,'avatar_delete');});
    await files.collect(req.userId);res.json(profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)));
  });
  app.post('/api/auth/password',loginLimiter,async(req,res)=>{
    const data=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(6,'Use pelo menos 6 caracteres.').regex(/\d/,'A senha deve conter pelo menos 1 número.').max(128)}).strict().parse(req.body);
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
    assert(await verifyPassword(data.currentPassword,user.password_hash),403,'INVALID_PASSWORD','Senha atual incorreta.');
    const hash=await hashPassword(data.newPassword);
    transaction(db,()=>{
      const changed=db.prepare('UPDATE users SET password_hash=?,version=version+1,updated_at=? WHERE id=? AND password_hash=?').run(hash,now(),req.userId,user.password_hash);
      assert(changed.changes===1,409,'VERSION_CONFLICT','A senha mudou. Entre novamente.');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.userId);audit(db,req.userId,'users',req.userId,'password_update');
    });res.json({csrf:createSession(db,config,req.userId,res)});
  });
  app.get('/api/bootstrap',async(req,res)=>{
    await worker.ready;
    // V3.2.0: organiza arquivos antigos em pastas gerenciadas antes de normalizar nomes.
    await files.ensureStructuredStorage(req.userId);
    await files.ensureManagedArrangementNames(req.userId);
    // V3.2.0: prepara o índice da Biblioteca em segundo plano. O bootstrap não espera
    // embeddings, então a tela abre rápido mesmo em um PC sem GPU.
    primeLibraryIndex(db,config,req.userId).catch(error=>console.warn('[sonota-search] Pré-indexação:',error.message));
    res.json({profile:(req.cloudProfile || profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId))),csrf:req.session.csrf,clients:listClients(db,req.userId),arrangements:listArrangements(db,req.userId),projects:listProjects(db,req.userId),docs:listDocs(db,req.userId),transcriptions:listJobs(db,req.userId),finance:financeSummary(db,req.userId),activity:projectActivity(db,req.userId),capabilities:{audio:worker.capabilities(),semanticConfigured:!!config.ollamaUrl,aiEnabled:config.aiEnabled,agentModel:config.agentModel,embeddingModel:config.embeddingModel}});
  });
  app.get('/api/finance/summary',(req,res)=>res.json(financeSummary(db,req.userId)));
  app.get('/api/dashboard',(req,res)=>{
    const projects=listProjects(db,req.userId);
    res.json({
      clients:listClients(db,req.userId).length,
      activeClients:listClients(db,req.userId).filter(c=>c.status==='Ativo').length,
      arrangements:listArrangements(db,req.userId).length,
      projects:projects.length,
      activeProjects:projects.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length,
      finance:financeSummary(db,req.userId),
      studioFlow:studioFlow(db,req.userId),
      alerts:operationalAlerts(db,req.userId),
      upcomingDeliveries:upcomingDeliveries(db,req.userId),
      recentActivity:listProjectEvents(db,req.userId,null,12),
      recentProjects:projects.slice(0,5),
      activity:projectActivity(db,req.userId)
    });
  });
  app.get('/api/clients/:id/overview',(req,res)=>{
    const client=entity(db,'clients',req.params.id,req.userId);
    const projects=listProjects(db,req.userId).filter(p=>p.clientId===client.id);
    const docs=listDocs(db,req.userId);
    const projectIds=new Set(projects.map(p=>p.id));
    const arrangementIds=new Set(projects.map(p=>p.arrangementId).filter(Boolean));
    res.json({client,projects,summary:{projects:projects.length,activeProjects:projects.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length,totalContracted:projects.reduce((n,p)=>n+p.value,0),received:projects.filter(p=>p.paid).reduce((n,p)=>n+p.value,0),pending:projects.filter(p=>!p.paid&&p.status!=='Cancelado').reduce((n,p)=>n+p.value,0),arrangements:arrangementIds.size,documents:docs.filter(d=>projectIds.has(d.projectId)).length}});
  });
  app.get('/api/projects/:id/workspace',(req,res)=>{
    const project=entity(db,'projects',req.params.id,req.userId);
    res.json({project,client:entity(db,'clients',project.clientId,req.userId),arrangement:project.arrangementId?entity(db,'arrangements',project.arrangementId,req.userId):null,versions:listProjectVersions(db,req.userId,project.id),documents:listDocs(db,req.userId).filter(d=>d.projectId===project.id),history:listProjectEvents(db,req.userId,project.id,200)});
  });
  const lists={clients:listClients,arrangements:listArrangements,projects:listProjects};
  for(const table of Object.keys(definitions)){
    app.get(`/api/${table}`,(req,res)=>{
      let items=lists[table](db,req.userId);const q=normalize(req.query.q||'');
      if(q)items=items.filter(item=>normalize(JSON.stringify(item)).includes(q));
      if(req.query.status)items=items.filter(item=>item.status===req.query.status);
      res.json(pagination(req,items));
    });
    app.get(`/api/${table}/:id`,(req,res)=>{owned(db,table,req.params.id,req.userId);res.json(entity(db,table,req.params.id,req.userId));});
    if(table!=='arrangements'){
      app.post(`/api/${table}`,(req,res)=>{
        const entityId=transaction(db,()=>createEntity(db,table,req.body,req.userId));
        const created=entity(db,table,entityId,req.userId);res.status(201).json(created);
        if(table==='projects'&&created.arrangementId)indexArrangement(db,config,req.userId,created.arrangementId).catch(error=>console.warn('[sonota-search] Índice do projeto:',error.message));
      });
      app.patch(`/api/${table}/:id`,(req,res)=>{
        const before=owned(db,table,req.params.id,req.userId),updated=transaction(db,()=>updateEntity(db,table,req.params.id,req.body,req.userId));
        res.json(updated);
        if(table==='projects'){
          const ids=new Set([before.arrangement_id,updated.arrangementId].filter(Boolean));
          for(const arrangementId of ids)indexArrangement(db,config,req.userId,arrangementId).catch(error=>console.warn('[sonota-search] Reindexação do projeto:',error.message));
        }else if(table==='clients'){
          const ids=new Set(db.prepare('SELECT arrangement_id FROM projects WHERE client_id=? AND user_id=? AND arrangement_id IS NOT NULL').all(req.params.id,req.userId).map(r=>r.arrangement_id));
          for(const arrangementId of ids)indexArrangement(db,config,req.userId,arrangementId).catch(error=>console.warn('[sonota-search] Reindexação do cliente:',error.message));
        }
      });
    }
    app.delete(`/api/${table}/:id`,async(req,res)=>{
      let arrangementToReindex=null;
      transaction(db,()=>{
        const row=owned(db,table,req.params.id,req.userId);versionCheck(row,Number(req.get('If-Match')));
        if(table==='clients'||table==='arrangements'){
          const fk=table==='clients'?'client_id':'arrangement_id';
          assert(!db.prepare(`SELECT 1 FROM projects WHERE ${fk}=? AND user_id=?`).get(row.id,req.userId),409,'IN_USE','Registro vinculado a projetos. Altere ou exclua os projetos primeiro.');
        }
        if(table==='arrangements')assert(!db.prepare("SELECT 1 FROM jobs WHERE arrangement_id=? AND status IN ('queued','running')").get(row.id),409,'JOB_ACTIVE','Cancele ou aguarde os trabalhos de áudio antes de excluir.');
        if(table==='projects')arrangementToReindex=row.arrangement_id||null;
        db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).run(row.id,req.userId);audit(db,req.userId,table,row.id,'delete');
      });
      if(table==='arrangements')removeArrangementIndex(db,req.userId,req.params.id);
      if(arrangementToReindex)indexArrangement(db,config,req.userId,arrangementToReindex).catch(error=>console.warn('[sonota-search] Reindexação após exclusão:',error.message));
      await files.collect(req.userId);res.sendStatus(204);
    });
  }
  app.post('/api/arrangements',files.middleware,async(req,res)=>{
    const data=arrangementSchema.parse(metadata(req));
    const file=await files.stage(req,'audio',{baseName:data.title,category:'arranjos'});
    const entityId=transaction(db,()=>{
      files.insert(file);const entityId=createEntity(db,'arrangements',data,req.userId,{file_id:file.id,duration:file.metadata.format.duration});
      db.prepare('INSERT INTO arrangement_versions VALUES (?,?,?,?,?,?)').run(id(),req.userId,entityId,file.id,1,now());return entityId;
    });
    file.committed=true;
    const created=entity(db,'arrangements',entityId,req.userId);res.status(201).json(created);
    indexArrangement(db,config,req.userId,entityId).catch(error=>console.warn('[sonota-search] Pré-indexação do arranjo:',error.message));
  });
  app.patch('/api/arrangements/:id',files.middleware,async(req,res)=>{
    const current=owned(db,'arrangements',req.params.id,req.userId);
    const currentFileId=current.file_id;
    const currentVersionNumber=db.prepare('SELECT COALESCE(MAX(number),1) n FROM arrangement_versions WHERE arrangement_id=?').get(req.params.id).n;
    const data=metadata(req);
    const desiredTitle=typeof data?.title==='string'&&data.title.trim()?data.title.trim():current.title;
    const file=req.file?await files.stage(req,'audio',{baseName:desiredTitle,category:'arranjos'}):null;
    transaction(db,()=>{
      if(file)files.insert(file);
      updateEntity(db,'arrangements',req.params.id,data,req.userId,file?{file_id:file.id,duration:file.metadata.format.duration}:{});
      if(file){
        const n=currentVersionNumber+1;
        db.prepare('INSERT INTO arrangement_versions VALUES (?,?,?,?,?,?)').run(id(),req.userId,req.params.id,file.id,n,now());
      }
    });
    if(file)file.committed=true;

    // O Sonota mantém o arquivo atual com o nome cadastrado no arranjo. Ao
    // substituir o áudio, a versão anterior recebe um sufixo de versão e o
    // novo arquivo assume o nome principal (ex.: "Tema Aurora.wav").
    try{
      if(file){
        await files.renameManaged(currentFileId,req.userId,`${current.title} - v${currentVersionNumber}`);
        await files.renameManaged(file.id,req.userId,desiredTitle);
      }else if(desiredTitle!==current.title){
        await files.renameManaged(currentFileId,req.userId,desiredTitle);
      }
    }catch(error){
      console.warn('[files] Não foi possível ajustar o nome gerenciado do arranjo:',error.message);
    }
    const updated=entity(db,'arrangements',req.params.id,req.userId);res.json(updated);
    indexArrangement(db,config,req.userId,req.params.id).catch(error=>console.warn('[sonota-search] Reindexação do arranjo:',error.message));
  });
  app.get('/api/arrangements/:id/versions',(req,res)=>{
    owned(db,'arrangements',req.params.id,req.userId);
    res.json(db.prepare('SELECT v.id,v.number,v.created_at createdAt,v.file_id fileId,f.original_name fileName,f.size FROM arrangement_versions v JOIN files f ON f.id=v.file_id WHERE v.arrangement_id=? AND v.user_id=? ORDER BY v.number DESC').all(req.params.id,req.userId));
  });
  app.get('/api/projects/:id/versions',(req,res)=>{
    owned(db,'projects',req.params.id,req.userId);res.json(listProjectVersions(db,req.userId,req.params.id));
  });
  app.post('/api/projects/:id/versions',files.middleware,async(req,res)=>{
    owned(db,'projects',req.params.id,req.userId);const data=projectVersionSchema.parse(metadata(req)),file=await files.stage(req,'audio',{category:'projetos'});
    const versionId=transaction(db,()=>{
      const project=owned(db,'projects',req.params.id,req.userId);files.insert(file);
      const number=(db.prepare('SELECT COALESCE(MAX(number),0) n FROM project_versions WHERE project_id=?').get(project.id).n||0)+1;
      const versionId=id();db.prepare('INSERT INTO project_versions(id,user_id,project_id,file_id,label,number,notes,status,sent_at,created_at) VALUES (?,?,?,?,?,?,?,?,NULL,?)').run(versionId,req.userId,project.id,file.id,data.label,number,data.notes,data.status,now());
      db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(),project.id);
      addProjectEvent(db,req.userId,project.id,'version-added',`${data.label} adicionada ao projeto.`,{number,status:data.status});
      audit(db,req.userId,'project_versions',versionId,'create',{projectId:project.id});return versionId;
    });file.committed=true;res.status(201).json(listProjectVersions(db,req.userId,req.params.id).find(v=>v.id===versionId));
  });
  app.patch('/api/projects/:projectId/versions/:versionId',(req,res)=>{
    const schema=z.object({label:z.string().trim().min(1).max(120).optional(),notes:z.string().trim().max(4000).optional(),status:z.enum(['Protótipo','Revisão','Aprovado','Master']).optional()}).strict().refine(v=>Object.keys(v).length>0,'Informe uma alteração.');
    const data=schema.parse(req.body);
    transaction(db,()=>{
      owned(db,'projects',req.params.projectId,req.userId);const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(req.params.versionId,req.params.projectId,req.userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
      const entries=Object.entries(data),map={label:'label',notes:'notes',status:'status'};db.prepare(`UPDATE project_versions SET ${entries.map(([k])=>`${map[k]}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),row.id);
      addProjectEvent(db,req.userId,row.project_id,'version-updated',`Versão ${row.number} atualizada.`,{fields:entries.map(([k])=>k)});
      audit(db,req.userId,'project_versions',row.id,'update',{fields:entries.map(([k])=>k)});
    });res.json(listProjectVersions(db,req.userId,req.params.projectId).find(v=>v.id===req.params.versionId));
  });
  app.post('/api/projects/:projectId/versions/:versionId/sent',(req,res)=>{
    transaction(db,()=>{
      owned(db,'projects',req.params.projectId,req.userId);const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(req.params.versionId,req.params.projectId,req.userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
      db.prepare('UPDATE project_versions SET sent_at=? WHERE id=?').run(now(),row.id);addProjectEvent(db,req.userId,row.project_id,'prototype-sent',`${row.label} marcada como enviada ao cliente.`,{versionId:row.id});audit(db,req.userId,'project_versions',row.id,'sent');
    });res.json(listProjectVersions(db,req.userId,req.params.projectId).find(v=>v.id===req.params.versionId));
  });
  app.delete('/api/projects/:projectId/versions/:versionId',async(req,res)=>{
    transaction(db,()=>{
      const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(req.params.versionId,req.params.projectId,req.userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
      db.prepare('DELETE FROM project_versions WHERE id=?').run(row.id);addProjectEvent(db,req.userId,row.project_id,'version-deleted',`Versão ${row.number} removida.`,{});audit(db,req.userId,'project_versions',row.id,'delete');
    });await files.collect(req.userId);res.sendStatus(204);
  });

  app.post('/api/files/:id/reveal',async(req,res)=>{
    assert(isLoopbackRequest(req),403,'LOCAL_ONLY','A localização do arquivo só pode ser aberta no Sonota instalado neste computador.');
    const file=files.resolve(req.params.id,req.userId);
    try{await revealFileInSystem(file.path);}catch{throw new AppError(500,'REVEAL_FAILED','Não foi possível abrir a localização do arquivo no sistema.');}
    res.json({ok:true,name:file.original_name});
  });

  app.post('/api/files/:id/open',async(req,res)=>{
    assert(process.env.SONOTA_DESKTOP==='true'&&isLoopbackRequest(req),403,'DESKTOP_ONLY','A visualização local está disponível apenas no Sonota Desktop.');
    const file=files.resolve(req.params.id,req.userId);
    try{await openFileInSystem(file.path);}catch{throw new AppError(500,'OPEN_FAILED','Não foi possível abrir este arquivo no aplicativo padrão do Windows.');}
    res.json({ok:true,name:file.original_name});
  });
  app.post('/api/files/:id/download-local',async(req,res)=>{
    assert(process.env.SONOTA_DESKTOP==='true'&&isLoopbackRequest(req),403,'DESKTOP_ONLY','O download local gerenciado está disponível apenas no Sonota Desktop.');
    const file=files.resolve(req.params.id,req.userId);
    const savedPath=await copyToDownloads(file);
    res.json({ok:true,name:path.basename(savedPath),path:savedPath});
  });

  app.get('/api/files/:id',(req,res,next)=>{
    const file=files.resolve(req.params.id,req.userId);res.type(file.mime);res.set('Cache-Control','private, no-store');
    const inline=req.query.inline==='1',download=req.query.download==='1'||(!inline&&!file.mime.startsWith('audio/'));
    if(download)res.download(file.path,file.original_name,err=>{if(err)next(err);});
    else res.sendFile(file.path,err=>{if(err)next(err);});
  });
  function insertDoc(u,projectId,file,description){
    files.insert(file);const docId=id();db.prepare('INSERT INTO docs VALUES (?,?,?,?,?,?)').run(docId,u,projectId,file.id,description,now());audit(db,u,'docs',docId,'create');addProjectEvent(db,u,projectId,'document-added',`Documento ${file.name || 'financeiro'} adicionado.`,{documentId:docId,description});return docId;
  }
  app.get('/api/documents',(req,res)=>res.json(pagination(req,listDocs(db,req.userId))));
  app.post('/api/documents',files.middleware,async(req,res)=>{
    const data=docSchema.parse(metadata(req));owned(db,'projects',data.projectId,req.userId);const file=await files.stage(req,'document',{category:'notas'});
    const docId=transaction(db,()=>{
      owned(db,'projects',data.projectId,req.userId);const docId=insertDoc(req.userId,data.projectId,file,data.description);
      db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(),data.projectId);return docId;
    });file.committed=true;res.status(201).json(listDocs(db,req.userId).find(d=>d.id===docId));
  });
  app.delete('/api/documents/:id',async(req,res)=>{
    transaction(db,()=>{
      const doc=db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').get(req.params.id,req.userId);assert(doc,404,'NOT_FOUND','Documento não encontrado.');
      db.prepare('DELETE FROM docs WHERE id=?').run(doc.id);db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(),doc.project_id);addProjectEvent(db,req.userId,doc.project_id,'document-deleted','Documento financeiro removido.',{documentId:doc.id});audit(db,req.userId,'docs',doc.id,'delete');
    });await files.collect(req.userId);res.sendStatus(204);
  });
  app.patch('/api/projects/:id/finance',files.middleware,async(req,res)=>{
    const data=financeSchema.parse(metadata(req));owned(db,'projects',req.params.id,req.userId);const file=req.file?await files.stage(req,'document',{category:'notas'}):null;
    assert(data.mode!=='replace'||file,400,'FILE_REQUIRED','Selecione o novo documento antes de substituir os anteriores.');
    transaction(db,()=>{
      updateEntity(db,'projects',req.params.id,{paid:data.paid,...(data.paymentDueDate!==undefined?{paymentDueDate:data.paymentDueDate}:{}),version:data.version},req.userId);
      if(file){if(data.mode==='replace')db.prepare('DELETE FROM docs WHERE project_id=? AND user_id=?').run(req.params.id,req.userId);insertDoc(req.userId,req.params.id,file,data.description);}
    });if(file)file.committed=true;await files.collect(req.userId);res.json({project:entity(db,'projects',req.params.id,req.userId),docs:listDocs(db,req.userId).filter(d=>d.projectId===req.params.id),summary:financeSummary(db,req.userId)});
  });
  app.post('/api/projects/:id/whatsapp',(req,res)=>{
    const project=entity(db,'projects',req.params.id,req.userId),client=entity(db,'clients',project.clientId,req.userId);
    const data=z.object({versionId:z.uuid().optional(),message:z.string().trim().max(2000).optional()}).strict().parse(req.body);
    const phone=(client.whatsapp||client.phone||'').replace(/\D/g,'');assert(phone,422,'WHATSAPP_REQUIRED','Cadastre o WhatsApp do cliente.');
    const version=data.versionId?listProjectVersions(db,req.userId,project.id).find(v=>v.id===data.versionId):null;if(data.versionId)assert(version,404,'NOT_FOUND','Versão não encontrada.');
    const message=data.message||`Olá, ${client.name}! Estou enviando ${version?`a versão ${version.label}`:'uma nova versão'} do projeto ${project.name} para sua avaliação.`;
    res.json({url:`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,message,client:{name:client.name,whatsapp:client.whatsapp||client.phone},version});
  });
  app.post('/api/search',async(req,res)=>{const data=searchSchema.parse(req.body);res.json(await search(db,config,req.userId,data.query,data.limit));});
  app.post('/api/assistant/message',async(req,res)=>{
    const data=messageSchema.parse(req.body);res.json(await interpret(db,config,req.userId,data.message,data.context||{}));
  });
  app.post('/api/assistant/actions/:id/confirm',async(req,res)=>{
    res.json(await confirmAssistantProposal({db,config,userId:req.userId,actionId:req.params.id,worker,files}));
  });
  app.get('/api/ai/status',async(req,res)=>res.json(await ollamaStatus(config)));

  // V3.0: reparo da IA local pelo próprio aplicativo. O instalador já prepara
  // Ollama + modelos, mas este endpoint permite recuperação caso antivírus, rede
  // ou uma atualização do Windows interrompa o provisionamento depois.
  let aiRepairChild=null;
  let aiRepairLast='';
  function aiInstallPaths(){
    const installRoot=path.resolve(ROOT,'..');
    return {
      root:installRoot,
      script:path.join(installRoot,'tools','install-ai.ps1'),
      status:path.join(installRoot,'runtime','ai-status.json')
    };
  }
  async function readAiInstallStatus(){
    const {status}=aiInstallPaths();
    try{return JSON.parse(await (await import('node:fs/promises')).readFile(status,'utf8'));}
    catch{return null;}
  }
  app.get('/api/desktop/ai/status',async(req,res)=>{
    assert(process.env.SONOTA_DESKTOP==='true'&&isLoopbackRequest(req),403,'DESKTOP_ONLY','Este recurso está disponível apenas no Sonota Desktop.');
    res.json({running:!!aiRepairChild,lastMessage:aiRepairLast,install:await readAiInstallStatus(),ai:await ollamaStatus(config)});
  });
  app.post('/api/desktop/ai/repair',async(req,res)=>{
    assert(process.env.SONOTA_DESKTOP==='true'&&isLoopbackRequest(req),403,'DESKTOP_ONLY','Este recurso está disponível apenas no Sonota Desktop.');
    if(aiRepairChild)return res.status(202).json({started:false,running:true,message:'A preparação da IA já está em andamento.'});
    const paths=aiInstallPaths();
    assert(existsSync(paths.script),500,'AI_REPAIR_MISSING','O instalador da IA local não foi encontrado.');
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',paths.script,'-InstallRoot',paths.root],{windowsHide:true,stdio:'ignore'});
    aiRepairChild=child;aiRepairLast='Preparação da IA iniciada.';
    child.once('error',error=>{aiRepairLast=`Falha ao iniciar reparo da IA: ${error.message}`;aiRepairChild=null;});
    child.once('exit',async(code)=>{
      const install=await readAiInstallStatus();
      if(install?.ok){config.aiEnabled=true;config.ollamaUrl='http://127.0.0.1:11434';}
      const status=await ollamaStatus(config);
      if(status?.available&&install?.ok)aiRepairLast='IA local pronta.';
      else aiRepairLast=install?.message||`Preparação finalizada (código ${code??'desconhecido'}).`;
      aiRepairChild=null;
    });
    res.status(202).json({started:true,running:true,message:'Preparando Ollama e modelos Qwen. O download pode demorar.'});
  });
  let audioRepairChild=null;
  let audioRepairLast='';
  function audioInstallPaths(){
    const installRoot=path.resolve(ROOT,'..');
    return {
      root:installRoot,
      script:path.join(installRoot,'tools','install-audio.ps1'),
      python:path.join(installRoot,'runtime','python310','python.exe'),
      status:path.join(installRoot,'runtime','audio-status.json')
    };
  }
  async function readAudioInstallStatus(){
    const {status}=audioInstallPaths();
    try{return JSON.parse(await (await import('node:fs/promises')).readFile(status,'utf8'));}
    catch{return null;}
  }
  app.get('/api/desktop/audio/status',async(req,res)=>{
    assert(process.env.SONOTA_DESKTOP==='true'&&isLoopbackRequest(req),403,'DESKTOP_ONLY','Este recurso está disponível apenas no Sonota Desktop.');
    res.json({running:!!audioRepairChild,lastMessage:audioRepairLast,install:await readAudioInstallStatus(),audio:worker.capabilities()});
  });
  app.post('/api/desktop/audio/repair',async(req,res)=>{
    assert(process.env.SONOTA_DESKTOP==='true'&&isLoopbackRequest(req),403,'DESKTOP_ONLY','Este recurso está disponível apenas no Sonota Desktop.');
    if(audioRepairChild)return res.status(202).json({started:false,running:true,message:'O reparo dos recursos de áudio já está em andamento.'});
    const paths=audioInstallPaths();
    assert(existsSync(paths.script),500,'AUDIO_REPAIR_MISSING','O instalador dos recursos de áudio não foi encontrado.');
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',paths.script,'-InstallRoot',paths.root],{windowsHide:true,stdio:'ignore'});
    audioRepairChild=child;audioRepairLast='Instalação/reparo iniciado.';
    child.once('error',error=>{audioRepairLast=`Falha ao iniciar reparo: ${error.message}`;audioRepairChild=null;});
    child.once('exit',async(code)=>{
      const install=await readAudioInstallStatus();
      try{
        if(existsSync(paths.python)){
          config.audioEnabled=true;config.python=paths.python;
          await worker.refreshCapabilities({python:paths.python});
        }
        audioRepairLast=install?.message||`Reparo finalizado (código ${code??'desconhecido'}).`;
      }catch(error){
        audioRepairLast=`Reparo terminou, mas a validação falhou: ${error?.message||error}`;
      }finally{
        audioRepairChild=null;
      }
    });
    res.status(202).json({started:true,running:true,message:'Reparo iniciado. O download das dependências pode levar alguns minutos.'});
  });
  app.get('/api/capabilities',async(req,res)=>{await worker.ready;res.json({audio:worker.capabilities(),semanticConfigured:!!config.ollamaUrl,ai:await ollamaStatus(config)});});
  app.get('/api/jobs',(req,res)=>res.json(listJobs(db,req.userId)));
  app.post('/api/jobs',async(req,res)=>{await worker.ready;const data=jobSchema.parse(req.body);const jobId=transaction(db,()=>worker.enqueue(req.userId,data.arrangementId,data.type));res.status(202).json(listJobs(db,req.userId).find(j=>j.id===jobId));});
  app.post('/api/jobs/:id/cancel',(req,res)=>{worker.cancel(req.userId,req.params.id);res.json({status:'cancelled'});});
  app.delete('/api/jobs/:id',async(req,res)=>{
    transaction(db,()=>{
      const job=db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(req.params.id,req.userId);assert(job,404,'NOT_FOUND','Trabalho não encontrado.');assert(!['queued','running'].includes(job.status),409,'JOB_ACTIVE','Cancele ou aguarde o trabalho antes de excluir.');
      db.prepare('DELETE FROM jobs WHERE id=?').run(job.id);audit(db,req.userId,'jobs',job.id,'delete');
    });await files.collect(req.userId);res.sendStatus(204);
  });
  app.get('/api/audit',(req,res)=>res.json(pagination(req,db.prepare('SELECT entity,entity_id entityId,action,details,created_at createdAt FROM audit WHERE user_id=? ORDER BY created_at DESC LIMIT 1000').all(req.userId).map(r=>({...r,details:JSON.parse(r.details)})))));
  app.get('/api/export',(req,res)=>{
    const projects=listProjects(db,req.userId);res.attachment('sonota-dados.json').json({exportedAt:now(),profile:(req.cloudProfile || profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId))),clients:listClients(db,req.userId),arrangements:listArrangements(db,req.userId),projects,projectVersions:Object.fromEntries(projects.map(p=>[p.id,listProjectVersions(db,req.userId,p.id)])),projectHistory:listProjectEvents(db,req.userId,null,5000),docs:listDocs(db,req.userId),jobs:listJobs(db,req.userId)});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Endpoint não encontrado.'}}));
  const ionicDir=path.join(config.publicDir,'ionic');
  if(existsSync(path.join(ionicDir,'index.html'))){
    app.use('/app',express.static(ionicDir,{dotfiles:'deny',etag:true,maxAge:0}));
    app.get('/app/*splat',(req,res)=>res.sendFile(path.join(ionicDir,'index.html')));
    app.get('/',(req,res)=>res.redirect('/app/'));
  }
  app.use(express.static(config.publicDir,{dotfiles:'deny',etag:true,maxAge:0}));
  app.use((req,res)=>res.status(404).type('text').send('Página não encontrada.'));
  app.use((err,req,res,next)=>{
    if(res.headersSent)return next(err);
    if(err instanceof ZodError){
      const labels={name:'Nome',title:'Nome do arranjo',email:'E-mail',clientId:'Cliente',arrangementId:'Arranjo',description:'Descrição',proposal:'Proposta / briefing',objective:'Objetivo',references:'Referências',musicalStyle:'Estilo musical',instruments:'Instrumentos',status:'Status',value:'Valor',dueDate:'Prazo',paymentDueDate:'Vencimento',bpm:'BPM',key:'Tonalidade',genre:'Gênero',tags:'Tags',phone:'Telefone',whatsapp:'WhatsApp',document:'CPF / CNPJ',city:'Cidade',notes:'Observações',version:'Versão'};
      const details=err.issues.map(i=>({field:i.path.join('.'),message:i.message}));
      const first=details[0];const field=labels[first?.field]||first?.field||'Campo';
      return res.status(422).json({error:{code:'VALIDATION_ERROR',message:`Não foi possível salvar. ${field}: ${first?.message||'valor inválido.'}`,details}});
    }
    if(err instanceof AppError)return res.status(err.status).json({error:{code:err.code,message:err.message,details:err.details}});
    if(err.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:{code:err.code,message:`O arquivo excede o limite de ${config.maxFileBytes/1024/1024} MB.`}});
    if(err.name==='MulterError')return res.status(400).json({error:{code:err.code,message:'Upload inválido. Envie um arquivo e seus metadados.'}});
    if(err.type==='entity.parse.failed')return res.status(400).json({error:{code:'INVALID_JSON',message:'JSON inválido.'}});
    if(err.type==='entity.too.large')return res.status(413).json({error:{code:'BODY_TOO_LARGE',message:'Requisição muito grande.'}});
    if(err.code==='ENOENT')return res.status(404).json({error:{code:'FILE_NOT_FOUND',message:'Arquivo não encontrado no servidor.'}});
    console.error('[request]',err);
    res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Não foi possível concluir a operação. Consulte o terminal do servidor.'}});
  });
  return {app,db,config,worker,async close(){await worker.close();db.close();release();}};
}
