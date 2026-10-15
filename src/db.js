import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './config.js';
import { migrateOwners } from './owner-migration.js';
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function openDatabase(config) {
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(config.dataDir, 'sonota.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  for (const name of readdirSync(path.join(ROOT, 'src/migrations')).filter(x => x.endsWith('.sql')).sort()) {
    if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get(name)) {
      transaction(db, () => {
        db.exec(readFileSync(path.join(ROOT, 'src/migrations', name), 'utf8'));
        db.prepare('INSERT INTO migrations VALUES (?,?)').run(name, now());
      });
    }
  }
  migrateOwners(db);
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function audit(db, userId, entity, entityId, action, details = {}) {
  db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?,?)').run(id(), userId, entity, entityId, action, JSON.stringify(details), now());
}
const base = row => ({ id: row.id, version: row.version, createdAt: row.created_at.slice(0,10), updatedAt: row.updated_at });
export function serializeClient(r) {
  return {...base(r), name:r.name, type:r.type, company:r.company, email:r.email, phone:r.phone, whatsapp:r.whatsapp || '', document:r.document, city:r.city, notes:r.notes, status:r.status};
}
export function serializeArrangement(r) {
  return {...base(r), title:r.title, fileId:r.file_id, fileName:r.original_name, fileType:r.original_name.split('.').pop().toUpperCase(), size:r.size, bpm:r.bpm, key:r.musical_key, genre:r.genre, instruments:JSON.parse(r.instruments), tags:JSON.parse(r.tags), notes:r.notes, duration:r.duration};
}
export function serializeProject(r) {
  return {...base(r), name:r.name, clientId:r.client_id, arrangementId:r.arrangement_id || '', description:r.description || '', proposal:r.proposal,
    objective:r.objective || '', references:r.references_text || '', musicalStyle:r.musical_style || '', instruments:JSON.parse(r.instruments || '[]'),
    status:r.status, value:r.value_cents / 100, dueDate:r.due_date, paymentDueDate:r.payment_due_date || '', paid:!!r.paid,
    paidAt:r.paid_at || null, completedAt:r.completed_at || null};
}
export function profile(r) {
  let prefs={deadlines:true,payments:true,prototypes:true,documents:true};
  try{prefs={...prefs,...JSON.parse(r.notification_preferences||'{}')}}catch{}
  return {id:r.id, name:r.name, email:r.email, role:r.role, studio:r.studio, phone:r.phone || '', avatarFileId:r.avatar_file_id || '', notificationPreferences:prefs, version:r.version};
}
export function listClients(db, u) { return db.prepare('SELECT * FROM clients WHERE user_id=? ORDER BY created_at DESC,id').all(u).map(serializeClient); }
export function listArrangements(db, u) { return db.prepare('SELECT a.*,f.original_name,f.size FROM arrangements a JOIN files f ON f.id=a.file_id WHERE a.user_id=? ORDER BY a.created_at DESC,a.id').all(u).map(serializeArrangement); }
export function listProjects(db,u) { return db.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY created_at DESC,id').all(u).map(serializeProject); }
export function listDocs(db,u) { return db.prepare('SELECT d.*,f.original_name,f.mime,f.size FROM docs d JOIN files f ON f.id=d.file_id WHERE d.user_id=? ORDER BY d.created_at DESC').all(u).map(r => ({id:r.id,projectId:r.project_id,fileId:r.file_id,fileName:r.original_name,fileType:r.mime,size:r.size,date:r.created_at.slice(0,10),description:r.description})); }
export function listJobs(db,u) {
  const rows=db.prepare(`SELECT j.*,f.original_name,a.duration source_duration FROM jobs j
    LEFT JOIN files f ON f.id=j.output_file_id
    JOIN arrangements a ON a.id=j.arrangement_id AND a.user_id=j.user_id
    WHERE j.user_id=? ORDER BY j.created_at DESC`).all(u);
  const history=new Map();
  for(const r of rows){
    if(r.status!=='completed'||!r.started_at||!r.completed_at||!r.source_duration)continue;
    const seconds=(Date.parse(r.completed_at)-Date.parse(r.started_at))/1000;
    if(seconds>1){const list=history.get(r.type)||[];list.push(seconds/Math.max(1,Number(r.source_duration)));history.set(r.type,list);}
  }
  const median=values=>{if(!values?.length)return null;const x=[...values].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
  const defaults={analysis:.35,stems:2.0,midi:1.05,partitura:1.25};
  const current=Date.now();
  return rows.map(r=>{
    const duration=Math.max(1,Number(r.source_duration)||60),ratio=median(history.get(r.type))||defaults[r.type]||1;
    const estimatedSeconds=Math.max(15,Math.round(duration*ratio+12));
    const start=r.started_at?Date.parse(r.started_at):null;
    const elapsedSeconds=start?Math.max(0,Math.round(((r.completed_at?Date.parse(r.completed_at):current)-start)/1000)):0;
    const remainingSeconds=['queued','running'].includes(r.status)?Math.max(0,estimatedSeconds-elapsedSeconds):0;
    const progressPercent=r.status==='completed'?100:r.status==='running'?Math.min(95,Math.max(4,Math.round(elapsedSeconds/Math.max(1,estimatedSeconds)*100))):r.status==='queued'?1:0;
    return {id:r.id,arrangementId:r.arrangement_id,type:r.type,status:r.status,fileId:r.output_file_id,fileName:r.original_name || '',date:r.created_at.slice(0,10),createdAt:r.created_at,startedAt:r.started_at||null,completedAt:r.completed_at||null,error:r.error,result:r.result?JSON.parse(r.result):null,updatedAt:r.updated_at,estimatedSeconds,elapsedSeconds,remainingSeconds,progressPercent};
  });
}
export function financeSummary(db,u) {
  const r = db.prepare(`SELECT COALESCE(SUM(CASE WHEN paid=1 THEN value_cents ELSE 0 END),0) received,
   COALESCE(SUM(CASE WHEN paid=0 AND status='Concluído' THEN value_cents ELSE 0 END),0) receivable,
   COALESCE(SUM(CASE WHEN paid=0 AND status NOT IN ('Concluído','Cancelado') THEN value_cents ELSE 0 END),0) forecast
   FROM projects WHERE user_id=?`).get(u);
  return {received:r.received/100,receivable:r.receivable/100,forecast:r.forecast/100};
}
export function projectActivity(db,u,reference=new Date()) {
  const counts=new Map(db.prepare("SELECT substr(created_at,1,7) month,COUNT(*) count FROM projects WHERE user_id=? GROUP BY substr(created_at,1,7)").all(u).map(r=>[r.month,r.count]));
  return Array.from({length:6},(_,i)=>{
    const d=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth()-5+i,1));
    const month=d.toISOString().slice(0,7);
    return {month,label:d.toLocaleDateString('pt-BR',{month:'short',timeZone:'UTC'}).replace('.',''),count:counts.get(month)||0};
  });
}
