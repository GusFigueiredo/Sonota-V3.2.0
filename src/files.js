import multer from 'multer';
import path from 'node:path';
import { mkdirSync, createReadStream, existsSync } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseFile } from 'music-metadata';
import { id, now } from './db.js';
import { assert } from './errors.js';

const TYPES={
  '.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.flac':'audio/flac',
  '.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.xml':'application/xml','.zip':'application/zip','.mid':'audio/midi',
  '.musicxml':'application/vnd.recordare.musicxml+xml'
};
const WINDOWS_RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const STORAGE_FOLDERS={arranjos:'arranjos',notas:'notas',projetos:'projetos',laboratorio:'laboratorio',perfil:'perfil',outros:'outros'};

function safeBaseName(value,fallback='arquivo') {
  let text=String(value||'').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-');
  text=text.replace(/\s+/g,' ').replace(/-+/g,'-').replace(/[. ]+$/g,'').trim();
  if(!text)text=fallback;
  if(WINDOWS_RESERVED.test(text))text=`_${text}`;
  return text.slice(0,110).replace(/[. ]+$/g,'')||fallback;
}
function cleanOriginalName(value) {
  return path.basename(String(value||'arquivo').replaceAll('\\','/'))
    .replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200) || 'arquivo';
}
function categoryName(value,kind='') {
  const requested=String(value||'').toLowerCase();
  if(STORAGE_FOLDERS[requested])return STORAGE_FOLDERS[requested];
  return kind==='audio'?'arranjos':kind==='document'?'notas':'outros';
}

export function storage(config,db) {
  const dir=path.join(config.dataDir,'uploads'), tmp=path.join(config.dataDir,'tmp');
  mkdirSync(dir,{recursive:true,mode:0o700});mkdirSync(tmp,{recursive:true,mode:0o700});
  Object.values(STORAGE_FOLDERS).forEach(folder=>mkdirSync(path.join(dir,folder),{recursive:true,mode:0o700}));
  const upload=multer({
    storage:multer.diskStorage({destination:tmp,filename:(req,file,cb)=>cb(null,id())}),
    limits:{fileSize:config.maxFileBytes,files:1,fields:3,fieldSize:100000,parts:4}
  }).single('file');

  function middleware(req,res,next) {
    const clean=()=>{
      if(req.file?.path) void rm(req.file.path,{force:true}).catch(()=>{});
      if(req.staged && !req.staged.committed) void rm(req.staged.path,{force:true}).catch(()=>{});
    };
    res.once('finish',clean);res.once('close',clean);
    upload(req,res,next);
  }

  function quota(u,size) {
    const used=db.prepare('SELECT COALESCE(SUM(size),0) AS used FROM files WHERE user_id=?').get(u).used;
    assert(used+size<=config.quotaBytes,413,'STORAGE_QUOTA','O limite de armazenamento da conta foi atingido.');
  }
  async function hashFile(filePath) {
    const hash=createHash('sha256');
    for await (const chunk of createReadStream(filePath))hash.update(chunk);
    return hash.digest('hex');
  }
  function storageNameAvailable(relativeName,currentId='') {
    const row=db.prepare('SELECT id FROM files WHERE storage_name=?').get(relativeName);
    if(row && row.id!==currentId)return false;
    if(!row && existsSync(path.join(dir,relativeName)))return false;
    return true;
  }
  function allocateStorageName(baseName,ext,currentId='',category='outros') {
    const folder=categoryName(category);
    let base=safeBaseName(baseName);
    if(ext && base.toLowerCase().endsWith(ext.toLowerCase()))base=base.slice(0,-ext.length).replace(/[. ]+$/g,'')||'arquivo';
    for(let i=1;i<=9999;i++){
      const suffix=i===1?'':` (${i})`;
      const max=Math.max(1,120-ext.length-suffix.length);
      const fileName=`${base.slice(0,max).replace(/[. ]+$/g,'')}${suffix}${ext}`;
      const relative=path.join(folder,fileName);
      if(storageNameAvailable(relative,currentId))return relative;
    }
    return path.join(folder,`${id()}${ext}`);
  }

  async function stage(req,kind,options={}) {
    const f=req.file;assert(f,400,'FILE_REQUIRED','Selecione um arquivo.');
    let original=f.originalname;
    if([...original].every(c=>c.charCodeAt(0)<=255)){
      try{original=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(original,'latin1'));}catch{}
    }
    const uploadedName=cleanOriginalName(original);
    const ext=path.extname(uploadedName).toLowerCase();
    const audio=kind==='audio';
    assert((audio?['.mp3','.wav','.ogg','.flac']:['.pdf','.png','.jpg','.jpeg','.xml']).includes(ext),415,'UNSUPPORTED_FILE',audio?'Use MP3, OGG, WAV ou FLAC.':'Use PDF, PNG, JPG ou XML.');
    assert(f.size>0,400,'EMPTY_FILE','O arquivo está vazio.');quota(req.userId,f.size);

    const handle=await open(f.path,'r');const b=Buffer.alloc(Math.min(f.size,4096));
    await handle.read(b,0,b.length,0);await handle.close();
    const signature=ext==='.wav'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE'
      :ext==='.ogg'?b.toString('ascii',0,4)==='OggS'
      :ext==='.flac'?b.toString('ascii',0,4)==='fLaC'
      :ext==='.mp3'?b.toString('ascii',0,3)==='ID3'||b[0]===255&&(b[1]&224)===224
      :ext==='.pdf'?b.toString('ascii',0,5)==='%PDF-'
      :['.jpg','.jpeg'].includes(ext)?b[0]===255&&b[1]===216&&b[2]===255
      :ext==='.png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      :b.toString('utf8').trimStart().startsWith('<');
    assert(signature,415,'FILE_SIGNATURE','O conteúdo do arquivo não corresponde ao formato informado.');

    let metadata=null;
    if(audio){
      try {metadata=await parseFile(f.path,{duration:true,skipCovers:true});}
      catch {assert(false,422,'INVALID_AUDIO','Não foi possível ler esse áudio. Verifique o arquivo.');}
      assert(metadata.format.duration>0&&metadata.format.numberOfChannels>0,422,'INVALID_AUDIO','O áudio não possui duração ou canais válidos.');
    }

    const fileId=id();
    const requestedBase=options.baseName ? safeBaseName(options.baseName,'arranjo') : path.basename(uploadedName,ext);
    const category=categoryName(options.category,kind);
    const storageName=allocateStorageName(requestedBase,ext,'',category);
    const displayName=options.baseName ? path.basename(storageName) : uploadedName;
    const destination=path.join(dir,storageName);
    mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
    const sha256=await hashFile(f.path);await rename(f.path,destination);
    const record={id:fileId,userId:req.userId,path:destination,storageName,name:displayName,mime:TYPES[ext],size:f.size,sha256,metadata};
    req.staged=record;return record;
  }

  function insert(record) {
    quota(record.userId,record.size);
    db.prepare('INSERT INTO files VALUES (?,?,?,?,?,?,?,?)').run(record.id,record.userId,record.storageName,record.name,record.mime,record.size,record.sha256,now());
  }

  async function generated(userId,source,name,options={}) {
    const info=await stat(source);quota(userId,info.size);
    const requested=cleanOriginalName(name);
    const ext=path.extname(requested).toLowerCase();
    const storageName=allocateStorageName(path.basename(requested,ext),ext,'',options.category||'laboratorio');
    const fileId=id(),destination=path.join(dir,storageName);
    mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
    const sha256=await hashFile(source);await rename(source,destination);
    return {id:fileId,userId,path:destination,storageName,name:path.basename(storageName),mime:TYPES[ext]||'application/octet-stream',size:info.size,sha256};
  }

  function resolve(fileId,userId) {
    const f=db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(fileId,userId);
    assert(f,404,'FILE_NOT_FOUND','Arquivo não encontrado.');
    const filePath=path.join(dir,f.storage_name);
    assert(existsSync(filePath),404,'FILE_MISSING','O registro existe, mas o arquivo não está mais neste computador.');
    return {...f,path:filePath};
  }

  async function moveManagedFile(fileId,userId,category,baseName=null) {
    const f=resolve(fileId,userId);
    const ext=path.extname(f.storage_name||f.original_name).toLowerCase();
    const currentCategory=path.dirname(f.storage_name)==='.'?'':path.dirname(f.storage_name).split(/[\\/]/)[0];
    const desired=categoryName(category);
    const nameBase=baseName||path.basename(f.original_name||f.storage_name,ext);
    if(currentCategory===desired && !baseName)return f;
    const nextName=allocateStorageName(nameBase,ext,fileId,desired);
    if(nextName===f.storage_name)return f;
    const from=path.join(dir,f.storage_name),to=path.join(dir,nextName);
    mkdirSync(path.dirname(to),{recursive:true,mode:0o700});
    await rename(from,to);
    db.prepare('UPDATE files SET storage_name=? WHERE id=? AND user_id=?').run(nextName,fileId,userId);
    return resolve(fileId,userId);
  }

  async function renameManaged(fileId,userId,baseName,category='arranjos') {
    const f=resolve(fileId,userId);
    const ext=path.extname(f.storage_name||f.original_name).toLowerCase();
    if(!ext)return f;
    const currentCategory=path.dirname(f.storage_name)==='.'?category:path.dirname(f.storage_name).split(/[\\/]/)[0];
    const nextName=allocateStorageName(baseName,ext,fileId,currentCategory||category);
    const nextDisplay=path.basename(nextName);
    if(nextName===f.storage_name && f.original_name===nextDisplay)return f;
    const from=path.join(dir,f.storage_name),to=path.join(dir,nextName);
    mkdirSync(path.dirname(to),{recursive:true,mode:0o700});
    if(from!==to)await rename(from,to);
    db.prepare('UPDATE files SET storage_name=?,original_name=? WHERE id=? AND user_id=?').run(nextName,nextDisplay,fileId,userId);
    return resolve(fileId,userId);
  }

  async function ensureManagedArrangementNames(userId) {
    const rows=db.prepare(`SELECT a.title,a.file_id fileId,f.storage_name storageName,f.original_name originalName
      FROM arrangements a JOIN files f ON f.id=a.file_id WHERE a.user_id=?`).all(userId);
    for(const row of rows){
      const ext=path.extname(row.storageName||row.originalName).toLowerCase();
      if(!ext)continue;
      const expectedBase=safeBaseName(row.title,'arranjo');
      const currentBase=path.basename(row.storageName,ext);
      const escaped=expectedBase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const matches=currentBase===expectedBase || new RegExp(`^${escaped} \\(\\d+\\)$`).test(currentBase);
      const category=path.dirname(row.storageName)==='.'?'':path.dirname(row.storageName).split(/[\\/]/)[0];
      if(matches && row.originalName===path.basename(row.storageName) && category==='arranjos')continue;
      try{
        if(category!=='arranjos')await moveManagedFile(row.fileId,userId,'arranjos',row.title);
        else await renameManaged(row.fileId,userId,row.title,'arranjos');
      }catch(error){console.warn('[files] Não foi possível normalizar o arquivo do arranjo:',error.message);}
    }
  }

  async function ensureStructuredStorage(userId) {
    const desired=new Map();
    const mark=(rows,category)=>rows.forEach(r=>{if(r.file_id&&!desired.has(r.file_id))desired.set(r.file_id,category)});
    mark(db.prepare('SELECT file_id FROM docs WHERE user_id=?').all(userId),'notas');
    mark(db.prepare('SELECT output_file_id file_id FROM jobs WHERE user_id=? AND output_file_id IS NOT NULL').all(userId),'laboratorio');
    mark(db.prepare('SELECT file_id FROM project_versions WHERE user_id=?').all(userId),'projetos');
    mark(db.prepare('SELECT file_id FROM arrangements WHERE user_id=?').all(userId),'arranjos');
    mark(db.prepare('SELECT file_id FROM arrangement_versions WHERE user_id=?').all(userId),'arranjos');
    const avatar=db.prepare('SELECT avatar_file_id file_id FROM users WHERE id=?').get(userId);if(avatar?.file_id&&!desired.has(avatar.file_id))desired.set(avatar.file_id,'perfil');
    for(const [fileId,category] of desired){
      try{
        const row=db.prepare('SELECT storage_name FROM files WHERE id=? AND user_id=?').get(fileId,userId);if(!row)continue;
        const current=path.dirname(row.storage_name)==='.'?'':path.dirname(row.storage_name).split(/[\\/]/)[0];
        if(current!==category)await moveManagedFile(fileId,userId,category);
      }catch(error){console.warn('[files] Organização de pastas:',error.message);}
    }
  }

  async function collect(userId) {
    const orphans=db.prepare(`SELECT * FROM files f WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM arrangements WHERE file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM arrangement_versions WHERE file_id=f.id) AND NOT EXISTS(SELECT 1 FROM docs WHERE file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM project_versions WHERE file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM jobs WHERE source_file_id=f.id OR output_file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM users WHERE avatar_file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM file_pins WHERE file_id=f.id)`).all(userId);
    for(const f of orphans){db.prepare('DELETE FROM files WHERE id=?').run(f.id);await rm(path.join(dir,f.storage_name),{force:true}).catch(()=>{});}
  }

  return {middleware,stage,insert,generated,resolve,renameManaged,moveManagedFile,ensureManagedArrangementNames,ensureStructuredStorage,collect,dir};
}
