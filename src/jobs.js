import { spawn } from 'node:child_process';
import { mkdir,rm,readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { id,now,transaction,audit } from './db.js';
import { owned } from './entities.js';
import { assert } from './errors.js';

function runPython(config,args,timeout,onChild) {
  return new Promise((resolve,reject)=>{
    const child=spawn(config.python,[path.join(ROOT,'audio/worker.py'),...args],{
      shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],
      env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}
    });
    onChild?.(child);let out='',err='',timedOut=false,settled=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
    child.stdout.on('data',b=>{out=(out+b).slice(-64000);});
    child.stderr.on('data',b=>{err=(err+b).slice(-64000);});
    child.on('error',e=>{if(settled)return;settled=true;clearTimeout(timer);reject(e);});
    child.on('close',code=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(code===0)resolve(out);
      else reject(new Error(timedOut?'Tempo máximo de processamento excedido.':err.trim()||'Processamento interrompido.'));
    });
  });
}

function usefulError(error) {
  const raw=String(error?.message||error||'').replace(/\r/g,'').trim();
  if(!raw)return 'Erro desconhecido no processador de áudio.';
  const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);
  const preferred=[...lines].reverse().find(line=>
    !/^traceback/i.test(line)&&
    !/^file\s+"/i.test(line)&&
    !/^at\s+/i.test(line)&&
    !/^during handling/i.test(line)
  ) || lines.at(-1) || raw;
  return preferred.slice(0,700);
}

function outputName(type,title,resultOutput) {
  const ext=path.extname(resultOutput||'');
  if(type==='stems')return `${title} - Stems${ext||'.zip'}`;
  if(type==='midi')return `${title} - MIDI${ext||'.mid'}`;
  if(type==='partitura')return `${title} - Partitura${ext||'.musicxml'}`;
  return resultOutput;
}

export function createWorker(db,config,files) {
  let stopped=false,pending=null,child=null,current=null;
  let capabilities={analysis:false,midi:false,partitura:false,stems:false,reason:'Processamento de áudio desativado.',details:{}};

  async function detectCapabilities(){
    if(!config.audioEnabled){
      capabilities={analysis:false,midi:false,partitura:false,stems:false,reason:'Processamento de áudio desativado.',details:{}};
      return capabilities;
    }
    try{
      const text=await runPython(config,['--capabilities'],45000);
      capabilities=JSON.parse(text.trim());
    }catch(error){
      capabilities={analysis:false,midi:false,partitura:false,stems:false,reason:`Python ou dependências de áudio indisponíveis: ${usefulError(error)}`,details:{}};
    }
    return capabilities;
  }
  const ready=detectCapabilities();
  async function refreshCapabilities(options={}){
    if(options.python){config.python=options.python;config.audioEnabled=true;}
    return detectCapabilities();
  }

  db.prepare("UPDATE jobs SET status='failed',error=?,completed_at=?,updated_at=? WHERE status='running'").run('O servidor foi reiniciado durante o processamento. Inicie um novo trabalho.',now(),now());

  function enqueue(userId,arrangementId,type) {
    assert(capabilities[type],503,'AUDIO_UNAVAILABLE',capabilities.details?.[type]||capabilities.reason||'Instale os recursos de áudio do Sonota.');
    const arr=owned(db,'arrangements',arrangementId,userId);
    assert(arr.file_id,422,'AUDIO_FILE_REQUIRED','Este arranjo não possui arquivo de áudio.');
    const existing=db.prepare("SELECT id FROM jobs WHERE user_id=? AND arrangement_id=? AND source_file_id=? AND type=? AND status IN ('queued','running')").get(userId,arrangementId,arr.file_id,type);
    if(existing)return existing.id;
    const count=db.prepare("SELECT COUNT(*) n FROM jobs WHERE user_id=? AND status IN ('queued','running')").get(userId).n;
    assert(count<5,429,'JOB_LIMIT','Aguarde os trabalhos em andamento antes de iniciar outros.');
    const jobId=id(),time=now();
    db.prepare("INSERT INTO jobs (id,user_id,arrangement_id,source_file_id,type,status,source_version,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?,?)")
      .run(jobId,userId,arrangementId,arr.file_id,type,arr.version,time,time);
    audit(db,userId,'jobs',jobId,'create',{type});
    // Dispara o processamento sem esperar o próximo intervalo do worker.
    queueMicrotask(pump);
    return jobId;
  }

  async function processNext() {
    await ready;if(stopped)return;
    const job=db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();if(!job)return;
    const started=now();const claimed=db.prepare("UPDATE jobs SET status='running',error=NULL,started_at=?,updated_at=? WHERE id=? AND status='queued'").run(started,started,job.id);if(!claimed.changes)return;
    current=job.id;const work=path.join(config.dataDir,'jobs',job.id);let generated=null;
    try{
      assert(capabilities[job.type],503,'AUDIO_UNAVAILABLE',capabilities.details?.[job.type]||'Modelo de áudio indisponível neste computador.');
      await mkdir(work,{recursive:true});
      const source=files.resolve(job.source_file_id,job.user_id);
      await runPython(config,['--type',job.type,'--input',source.path,'--output',work],config.jobTimeoutMs,c=>{child=c;});
      child=null;
      if(db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id)?.status!=='running')return;
      const result=JSON.parse(await readFile(path.join(work,'result.json'),'utf8'));
      if(result.output){
        assert(path.basename(result.output)===result.output,500,'BAD_OUTPUT','Saída de áudio inválida.');
        const arr=owned(db,'arrangements',job.arrangement_id,job.user_id);
        const friendly=outputName(job.type,arr.title,result.output);
        generated=await files.generated(job.user_id,path.join(work,result.output),friendly,{category:'laboratorio'});
        result.outputName=generated.name;
      }
      transaction(db,()=>{
        if(generated)files.insert(generated);
        if(job.type==='analysis'){
          const arr=owned(db,'arrangements',job.arrangement_id,job.user_id);
          result.applied=arr.version===job.source_version&&arr.file_id===job.source_file_id;
          if(result.applied){
            const bpm=Number.isFinite(result.bpm)&&result.bpm>=20&&result.bpm<=300?result.bpm:null;
            const key=typeof result.key==='string'&&/^[A-G](#|b)?m?$/.test(result.key)?result.key:'';
            db.prepare("UPDATE arrangements SET bpm=COALESCE(bpm,?),musical_key=CASE WHEN musical_key='' THEN ? ELSE musical_key END,version=version+1,updated_at=? WHERE id=? AND user_id=?")
              .run(bpm,key,now(),job.arrangement_id,job.user_id);
          }
        }
        const finished=now();db.prepare("UPDATE jobs SET status='completed',output_file_id=?,result=?,error=NULL,completed_at=?,updated_at=? WHERE id=?")
          .run(generated?.id||null,JSON.stringify(result),finished,finished,job.id);
        audit(db,job.user_id,'jobs',job.id,'complete',{type:job.type});
      });
      if(generated)generated.committed=true;
    }catch(error){
      const detail=usefulError(error);
      const message=error?.code==='AUDIO_UNAVAILABLE'
        ? String(error.message)
        : `Não foi possível processar o áudio. ${detail}`;
      console.error(`[audio ${job.id}]`,String(error?.message||error).slice(-6000));
      const failedAt=now();db.prepare("UPDATE jobs SET status='failed',error=?,completed_at=?,updated_at=? WHERE id=? AND status='running'").run(message.slice(0,1500),failedAt,failedAt,job.id);
    }finally{
      if(generated&&!generated.committed)await rm(generated.path,{force:true});
      await rm(work,{recursive:true,force:true});current=null;child=null;
    }
  }

  function pump(){
    if(!stopped&&!pending)pending=processNext().catch(e=>console.error('[audio worker]',e.message)).finally(()=>{pending=null;});
  }
  const timer=setInterval(pump,1000);timer.unref();

  function cancel(userId,jobId){
    const job=db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(jobId,userId);assert(job,404,'NOT_FOUND','Trabalho não encontrado.');
    assert(['queued','running'].includes(job.status),409,'JOB_FINISHED','Este trabalho já terminou.');
    const cancelledAt=now();db.prepare("UPDATE jobs SET status='cancelled',completed_at=?,updated_at=? WHERE id=?").run(cancelledAt,cancelledAt,jobId);
    if(current===jobId)child?.kill('SIGKILL');audit(db,userId,'jobs',jobId,'cancel');
  }

  return {
    ready,
    capabilities:()=>({...capabilities,details:{...(capabilities.details||{})}}),
    refreshCapabilities,
    enqueue,cancel,
    async close(){stopped=true;clearInterval(timer);child?.kill('SIGKILL');await pending;}
  };
}
