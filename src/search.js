import { createHash } from 'node:crypto';
import { listArrangements,listClients,listProjects } from './db.js';
import { ollamaChat,ollamaEmbed } from './ai/ollama.js';
import { loadAiMessages,saveAiMessage } from './ai/memory.js';

export const normalize = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const groups=[['synth','sintetizador','sintetizadores','synths'],['baixo','bass'],['bateria','drums','drum'],['cordas','strings','violino'],['piano','teclado'],['guitarra','guitar'],['percussao','percussion'],['tensao','tenso','suspense'],['leve','suave','calmo','tranquilo'],['emocional','emotivo','sentimental'],['energetico','energia','animado'],['melancolico','triste','melancolia'],['eletronico','eletronica','electronic'],['cinematic','cinematografico','cinematografica'],['voz','vocal','vocals','vozes']];
const alternatives = term => groups.find(g=>g.includes(term))||[term];
const stop=new Set('quero procure procura encontrar encontre busque busca buscar mostre mostrar liste listar preciso me de da do das dos com e ou um uma entre ate a em para por favor musica musicas faixa faixas arquivo arquivos arranjo arranjos que tenha tenham som sons algo os as o no na esse essa bpm tom tonalidade maior menor projeto projetos cliente clientes nome pelo menos minimo minima maximo maxima partir acima abaixo'.split(' '));

function removeMatch(text,raw){return raw?text.replace(normalize(raw),' '):text}

// Parser determinístico: restrições objetivas são SEMPRE filtros obrigatórios.
// Embeddings só ranqueiam o que já passou por nome/BPM/tom/gênero etc.
export function parseQuery(query) {
  const originalText=String(query||'');
  let text=normalize(originalText),minBpm=null,maxBpm=null,key=null,exactTitle='';const excluded=[];

  const quotedName=originalText.match(/(?:nome|chamad[oa]|arranjo)\s*(?:do\s+arranjo\s*)?(?:é|e|:)?\s*["“']([^"”']+)["”']/i)
    || originalText.match(/["“']([^"”']+)["”']/);
  if(quotedName){exactTitle=String(quotedName[1]||'').trim();text=removeMatch(text,quotedName[0]);}
  else {
    const plainName=originalText.match(/(?:com\s+o\s+nome|nome(?:ado)?|chamad[oa])\s+([^,;.]+?)(?=\s+(?:com|de|e|bpm|acima|abaixo|pelo|no\s+m[ií]nimo|no\s+m[aá]ximo)|$)/i);
    if(plainName){exactTitle=String(plainName[1]||'').trim();text=removeMatch(text,plainName[0]);}
  }

  let match;
  const range=/(?:bpm\s*)?(\d{2,3})\s*(?:a|e|ate|até|-)\s*(\d{2,3})(?:\s*(?:de\s*)?bpm)?/i;
  match=originalText.match(range);
  if(match){minBpm=Number(match[1]);maxBpm=Number(match[2]);text=removeMatch(text,match[0]);if(minBpm>maxBpm)[minBpm,maxBpm]=[maxBpm,minBpm];}
  if(minBpm===null&&maxBpm===null){
    match=originalText.match(/(?:pelo\s+menos|no\s+m[ií]nimo|m[ií]nimo\s+de|a\s+partir\s+de|acima\s+de|maior(?:es)?\s+que|mais\s+de)\s*(\d{2,3})\s*(?:de\s*)?bpm/i);
    if(match){minBpm=Number(match[1]);text=removeMatch(text,match[0]);}
  }
  if(minBpm===null&&maxBpm===null){
    match=originalText.match(/(?:no\s+m[aá]ximo|m[aá]ximo\s+de|at[eé]\s+|abaixo\s+de|menor(?:es)?\s+que|menos\s+de)\s*(\d{2,3})\s*(?:de\s*)?bpm/i);
    if(match){maxBpm=Number(match[1]);text=removeMatch(text,match[0]);}
  }
  if(minBpm===null&&maxBpm===null){
    match=originalText.match(/(?:bpm\s*(\d{2,3})|(\d{2,3})\s*(?:de\s*)?bpm)/i);
    if(match){const bpm=Number(match[1]||match[2]);minBpm=bpm;maxBpm=bpm;text=removeMatch(text,match[0]);}
  }

  const original=originalText.match(/(?:tonalidade|tom)\s*(?:de\s*)?([A-Ga-g](?:#|b)?m?)(?=$|[\s,.;!?])/);
  if(original){key=original[1][0].toUpperCase()+original[1].slice(1);text=removeMatch(text,original[0]);}
  text=text.replace(/\bsem\s+([a-z]+)/g,(_,term)=>{excluded.push(term);return ' ';});
  const terms=[...new Set(text.split(/[^a-z0-9#]+/).filter(t=>t.length>1&&!stop.has(t)&&!/^\d+$/.test(t)))];
  return {minBpm,maxBpm,key,genre:'',instruments:[],tags:[],terms,excluded,exactTitle,semanticQuery:terms.join(' '),planner:'fallback'};
}
export function similarity(a,b) {
  a=normalize(a);b=normalize(b);if(a===b)return 1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}
  return 1-prev[b.length]/Math.max(a.length,b.length,1);
}
function termMatch(term,text) {
  const words=text.split(/[^a-z0-9#]+/);
  return alternatives(normalize(term)).some(t=>words.some(w=>w===t||(t.length>=4&&w.length>=4&&similarity(t,w)>=0.78)));
}
const cosine=(a,b)=>{if(a.length!==b.length)return 0;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;};

const plannerFormat={
  type:'object',additionalProperties:false,
  properties:{
    minBpm:{anyOf:[{type:'number'},{type:'null'}]},maxBpm:{anyOf:[{type:'number'},{type:'null'}]},key:{type:'string'},genre:{type:'string'},exactTitle:{type:'string'},
    instruments:{type:'array',items:{type:'string'}},tags:{type:'array',items:{type:'string'}},excluded:{type:'array',items:{type:'string'}},
    terms:{type:'array',items:{type:'string'}},semanticQuery:{type:'string'}
  },required:['minBpm','maxBpm','key','genre','exactTitle','instruments','tags','excluded','terms','semanticQuery']
};
function needsPlanner(query,useHistory){
  if(!useHistory)return false;const q=normalize(query).trim();
  return /\b(agora|dessas|desses|delas|deles|so|somente|mais|menos|anterior|anteriores|refina|refine|mantem|mantendo|tambem)\b/.test(q)||q.length<28;
}
async function planQuery(db,config,userId,query,useHistory=true){
  const history=useHistory?loadAiMessages(db,userId,'search',4).map(m=>({role:m.role,content:m.content})):[];
  if(!config.aiEnabled||!config.ollamaUrl||!config.aiFastEnabled||!needsPlanner(query,history.length>0))return parseQuery(query);
  try{
    const response=await ollamaChat(config,{model:config.aiFastModel,format:plannerFormat,think:false,timeoutMs:config.aiFastTimeoutMs,options:{num_ctx:config.aiFastContext,num_predict:112,temperature:0},keepAlive:config.aiKeepAlive,messages:[
      {role:'system',content:`Você planeja a Busca Inteligente do Sonota. Filtros objetivos são obrigatórios: "pelo menos 100 BPM" = minBpm 100; "no máximo 120 BPM" = maxBpm 120; nome explicitamente pedido = exactTitle. Não invente valores. semanticQuery deve conter apenas características subjetivas que realmente precisem de similaridade. Retorne somente JSON.`},
      ...history,{role:'user',content:query}
    ]});
    const parsed=JSON.parse(response.message.content||'{}');
    const clean={
      minBpm:Number.isFinite(parsed.minBpm)?parsed.minBpm:null,maxBpm:Number.isFinite(parsed.maxBpm)?parsed.maxBpm:null,key:String(parsed.key||''),genre:String(parsed.genre||''),exactTitle:String(parsed.exactTitle||''),
      instruments:Array.isArray(parsed.instruments)?parsed.instruments.map(String).filter(Boolean):[],tags:Array.isArray(parsed.tags)?parsed.tags.map(String).filter(Boolean):[],excluded:Array.isArray(parsed.excluded)?parsed.excluded.map(String).filter(Boolean):[],terms:Array.isArray(parsed.terms)?parsed.terms.map(String).filter(Boolean):[],semanticQuery:String(parsed.semanticQuery||'').trim(),planner:'ollama'
    };
    if(clean.minBpm!==null&&clean.maxBpm!==null&&clean.minBpm>clean.maxBpm)[clean.minBpm,clean.maxBpm]=[clean.maxBpm,clean.minBpm];
    return clean;
  }catch{return parseQuery(query)}
}

function arrangementDocument(a,linked,clients){
  const projectText=linked.map(p=>`${p.name}. Cliente ${clients.find(c=>c.id===p.clientId)?.name||''}. ${p.description||''} ${p.proposal||''} ${p.objective||''} ${p.musicalStyle||''}`).join(' ');
  return `${a.title}. Arquivo ${a.fileName}. ${a.bpm?`${a.bpm} BPM.`:''} ${a.key?`Tonalidade ${a.key}.`:''} ${a.genre?`Gênero ${a.genre}.`:''} Instrumentos ${(a.instruments||[]).join(', ')}. Tags ${(a.tags||[]).join(', ')}. Observações ${a.notes||''}. ${projectText}`.trim();
}
function upsertFts(db,userId,arrangementId,content){try{db.prepare('DELETE FROM arrangement_fts WHERE arrangement_id=? AND user_id=?').run(arrangementId,userId);db.prepare('INSERT INTO arrangement_fts(arrangement_id,user_id,content) VALUES (?,?,?)').run(arrangementId,userId,content);}catch{}}
function ensureFtsSeeded(db,userId,candidates){try{const known=new Map(db.prepare('SELECT arrangement_id,content FROM arrangement_fts WHERE user_id=?').all(userId).map(r=>[r.arrangement_id,r.content]));for(const c of candidates)if(known.get(c.arrangement.id)!==c.content)upsertFts(db,userId,c.arrangement.id,c.content);}catch{}}
function ftsScores(db,userId,terms){
  const clean=[...new Set(terms.map(t=>normalize(t).replace(/[^a-z0-9#]/g,'')).filter(t=>t.length>1))];if(!clean.length)return new Map();
  try{const query=clean.map(t=>`"${t.replaceAll('"','')}"`).join(' OR ');const rows=db.prepare('SELECT arrangement_id,bm25(arrangement_fts) rank FROM arrangement_fts WHERE arrangement_fts MATCH ? AND user_id=? LIMIT 200').all(query,userId);if(!rows.length)return new Map();const values=rows.map(r=>r.rank),min=Math.min(...values),max=Math.max(...values),span=Math.max(0.0001,max-min);return new Map(rows.map(r=>[r.arrangement_id,1-(r.rank-min)/span]));}catch{return new Map()}
}
export function removeArrangementIndex(db,userId,arrangementId){try{db.prepare('DELETE FROM arrangement_fts WHERE arrangement_id=? AND user_id=?').run(arrangementId,userId)}catch{}try{db.prepare('DELETE FROM embeddings WHERE arrangement_id=? AND user_id=?').run(arrangementId,userId)}catch{}}
function buildIndexRecord(db,userId,arrangementId){const arrangement=listArrangements(db,userId).find(a=>a.id===arrangementId);if(!arrangement)return null;const clients=listClients(db,userId),linked=listProjects(db,userId).filter(p=>p.arrangementId===arrangement.id);return {arrangement,linked:linked.map(p=>({id:p.id,name:p.name})),linkedFull:linked,content:arrangementDocument(arrangement,linked,clients)};}
export async function indexArrangement(db,config,userId,arrangementId,{embedding=true}={}){const record=buildIndexRecord(db,userId,arrangementId);if(!record){removeArrangementIndex(db,userId,arrangementId);return {ok:false,reason:'missing'}}upsertFts(db,userId,arrangementId,record.content);if(!embedding||!config.ollamaUrl)return {ok:true,fts:true,embedding:false};const hash=createHash('sha256').update(record.content).digest('hex');const cached=db.prepare('SELECT 1 FROM embeddings WHERE arrangement_id=? AND user_id=? AND model=? AND content_hash=?').get(arrangementId,userId,config.embeddingModel,hash);if(cached)return {ok:true,fts:true,embedding:true,cached:true};const [vector]=await ollamaEmbed(config,[record.content]);if(!db.prepare('SELECT 1 FROM arrangements WHERE id=? AND user_id=?').get(arrangementId,userId))return {ok:false,reason:'deleted'};db.prepare('INSERT OR REPLACE INTO embeddings VALUES (?,?,?,?,?)').run(userId,arrangementId,config.embeddingModel,hash,JSON.stringify(vector));return {ok:true,fts:true,embedding:true,cached:false};}
export async function primeLibraryIndex(db,config,userId){const ids=listArrangements(db,userId).map(a=>a.id);for(const arrangementId of ids){try{await indexArrangement(db,config,userId,arrangementId,{embedding:true})}catch(error){console.warn('[sonota-search] Pré-indexação parcial:',error.message);}}return {ok:true,count:ids.length};}
async function semanticVectors(db,config,userId,candidates,queryText){
  if(!config.ollamaUrl||!candidates.length||!queryText.trim())return null;const vectors=new Map(),missing=[];
  for(const c of candidates){const hash=createHash('sha256').update(c.content).digest('hex');const cached=db.prepare('SELECT vector FROM embeddings WHERE arrangement_id=? AND user_id=? AND model=? AND content_hash=?').get(c.arrangement.id,userId,config.embeddingModel,hash);if(cached)vectors.set(c.arrangement.id,JSON.parse(cached.vector));else missing.push({...c,hash});}
  for(let i=0;i<missing.length;i+=16){const batch=missing.slice(i,i+16),values=await ollamaEmbed(config,batch.map(c=>c.content));batch.forEach((c,j)=>{if(!db.prepare('SELECT 1 FROM arrangements WHERE id=? AND user_id=?').get(c.arrangement.id,userId))return;db.prepare('INSERT OR REPLACE INTO embeddings VALUES (?,?,?,?,?)').run(userId,c.arrangement.id,config.embeddingModel,c.hash,JSON.stringify(values[j]));vectors.set(c.arrangement.id,values[j]);});}
  const [queryVector]=await ollamaEmbed(config,[queryText]);return {vectors,queryVector};
}
function answerSearch(criteria,results,total){
  if(!results.length)return 'Não encontrei arranjos que atendam aos filtros informados.';
  if(criteria.exactTitle&&results.length===1)return `Encontrei o arranjo “${results[0].arrangement.title}”.`;
  const top=results[0],a=top.arrangement;const details=[a.bpm?`${a.bpm} BPM`:'',a.key||'',a.genre||''].filter(Boolean).join(' • ');
  return `Encontrei ${total} resultado(s). O mais relevante é “${a.title}” (${top.matchLabel||`${top.relevance}%`}${details?` • ${details}`:''}).`;
}

export async function search(db,config,userId,query,limit=10,options={}) {
  const criteria=await planQuery(db,config,userId,query,options.saveConversation!==false),clients=listClients(db,userId),projects=listProjects(db,userId);
  const all=listArrangements(db,userId).map(a=>{const linked=projects.filter(p=>p.arrangementId===a.id);return {arrangement:a,linked:linked.map(p=>({id:p.id,name:p.name})),linkedFull:linked,content:arrangementDocument(a,linked,clients)}});
  const candidates=all.filter(r=>{
    const a=r.arrangement,text=normalize(r.content);
    const titleOk=!criteria.exactTitle||normalize(a.title)===normalize(criteria.exactTitle);
    const bpmOk=(criteria.minBpm===null||criteria.minBpm===undefined||(a.bpm!==null&&Number(a.bpm)>=Number(criteria.minBpm)))&&(criteria.maxBpm===null||criteria.maxBpm===undefined||(a.bpm!==null&&Number(a.bpm)<=Number(criteria.maxBpm)));
    const keyOk=!criteria.key||normalize(a.key)===normalize(criteria.key);
    const genreOk=!criteria.genre||termMatch(criteria.genre,normalize(a.genre));
    const instrumentsOk=(criteria.instruments||[]).every(t=>(a.instruments||[]).some(x=>termMatch(t,normalize(x))));
    const tagsOk=(criteria.tags||[]).every(t=>(a.tags||[]).some(x=>termMatch(t,normalize(x))));
    const excludedOk=!(criteria.excluded||[]).some(t=>termMatch(t,text));
    return titleOk&&bpmOk&&keyOk&&genreOk&&instrumentsOk&&tagsOk&&excludedOk;
  });

  ensureFtsSeeded(db,userId,all);
  const lexicalTerms=[...(criteria.terms||[])].filter(Boolean),fts=ftsScores(db,userId,lexicalTerms);
  let semantic=null,mode='metadata',notice='Filtros objetivos aplicados antes do ranking de relevância.';
  if(config.ollamaUrl&&candidates.length&&(criteria.semanticQuery||'').trim()&&lexicalTerms.length){
    try{semantic=await semanticVectors(db,config,userId,candidates,criteria.semanticQuery);mode='hybrid';notice='Busca híbrida: filtros obrigatórios + texto + similaridade semântica.';}
    catch{semantic=null;notice='A busca semântica está indisponível; filtros objetivos e texto continuam funcionando.'}
  }

  const results=candidates.map(c=>{
    const text=normalize(c.content),title=normalize(c.arrangement.title),matched=lexicalTerms.filter(t=>termMatch(t,text));
    const manual=lexicalTerms.length?matched.length/lexicalTerms.length:1,ftsScore=fts.get(c.arrangement.id)||0;
    let lexical=lexicalTerms.length?Math.max(manual,ftsScore):1;
    const semanticScore=semantic?.vectors.has(c.arrangement.id)?cosine(semantic.queryVector,semantic.vectors.get(c.arrangement.id)):0;
    const allTermsInTitle=lexicalTerms.length>0&&lexicalTerms.every(t=>termMatch(t,title));
    if(allTermsInTitle)lexical=Math.max(lexical,.98);
    const eligible=!lexicalTerms.length||matched.length>0||ftsScore>0||semanticScore>=0.45;
    let relevance,matchLabel='';
    if(criteria.exactTitle){relevance=100;matchLabel='Correspondência exata';}
    else if(!lexicalTerms.length){relevance=100;matchLabel='Atende aos filtros';}
    else {const raw=semantic?0.58*lexical+0.42*Math.max(0,semanticScore):lexical;relevance=Math.max(0,Math.min(100,Math.round(raw*100)));if(allTermsInTitle&&relevance>=95)matchLabel='Nome muito compatível';}
    return {arrangement:c.arrangement,linked:c.linked,relevance,matchLabel,matched,semantic:Math.round(Math.max(0,semanticScore)*100),eligible};
  }).filter(r=>r.eligible).sort((a,b)=>b.relevance-a.relevance||a.arrangement.title.localeCompare(b.arrangement.title));

  const sliced=results.slice(0,limit).map(({eligible,...r})=>r),answer=options.saveConversation===false?null:answerSearch(criteria,sliced,results.length);
  if(options.saveConversation!==false){const generic=sliced.length?`Encontrei ${results.length} resultado(s). O mais relevante é “${sliced[0].arrangement.title}”.`:'Não encontrei arranjos compatíveis com esta busca.';saveAiMessage(db,userId,'search','user',query,{criteria});saveAiMessage(db,userId,'search','assistant',answer||generic,{total:results.length,mode});}
  return {mode,notice,criteria,total:results.length,answer,results:sliced};
}
