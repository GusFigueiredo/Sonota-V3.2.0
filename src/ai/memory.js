import { id,now } from '../db.js';

// # Salva uma mensagem de conversa
// A memória é separada por canal: "assistant" para o agente operacional e
// "search" para a Busca Inteligente. Isso evita misturar uma conversa com a outra.
export function saveAiMessage(db,userId,channel,role,content,metadata={}){
  const text=String(content||'').trim();
  if(!text)return;
  db.prepare('INSERT INTO ai_messages(id,user_id,channel,role,content,metadata,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id(),userId,channel,role,text,JSON.stringify(metadata||{}),now());
}

// # Recupera apenas a janela recente de conversa
// O agente nunca recebe o banco inteiro como memória. Ele recebe poucas mensagens e,
// quando precisa de dados, é obrigado a usar as tools que consultam o SQLite atual.
export function loadAiMessages(db,userId,channel,limit=12){
  const rows=db.prepare(`SELECT role,content,metadata,created_at FROM ai_messages
    WHERE user_id=? AND channel=? ORDER BY created_at DESC LIMIT ?`).all(userId,channel,limit);
  return rows.reverse().map(r=>({role:r.role,content:r.content,metadata:safeJson(r.metadata),createdAt:r.created_at}));
}

export function clearAiMessages(db,userId,channel){
  db.prepare('DELETE FROM ai_messages WHERE user_id=? AND channel=?').run(userId,channel);
}

function safeJson(value){try{return JSON.parse(value||'{}')}catch{return {}}}
