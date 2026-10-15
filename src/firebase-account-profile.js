import { assert } from './errors.js';
import { profile } from './db.js';

async function remote(db,config,userId) {
  const owner=db.prepare('SELECT firebase_uid FROM owners WHERE id=?').get(userId);
  assert(owner?.firebase_uid,401,'UNAUTHENTICATED','Entre novamente pelo Firebase.');
  const services=config.cloudServices || await import('./firebase-admin.js');
  return {uid:owner.firebase_uid,firestore:services.firestore,ref:services.firestore.collection('usuarios').doc(owner.firebase_uid)};
}
export async function readAccountProfile(db,config,userId) {
  if(!config.firebaseOnly)return profile(db.prepare('SELECT * FROM users WHERE id=?').get(userId));
  const {ref}=await remote(db,config,userId),snapshot=await ref.get();
  assert(snapshot.exists,404,'PROFILE_REQUIRED','Conclua seu cadastro.');
  const data=snapshot.data();
  return {id:userId,name:data.name,studio:data.studio||'',role:data.role||'',phone:data.phone||'',version:data.version||1};
}
export async function applyCloudProfileProposal(db,config,userId,actionId,op) {
  const {ref,firestore}=await remote(db,config,userId);
  const receipt=ref.collection('operacoes').doc(actionId);
  return firestore.runTransaction(async tx=>{
    const saved=await tx.get(receipt);
    if(saved.exists)return saved.data().result;
    const snapshot=await tx.get(ref);
    assert(snapshot.exists && snapshot.data().version===op.version,409,'VERSION_CONFLICT','O perfil mudou. Solicite uma nova proposta.');
    const patch=Object.fromEntries(Object.entries(op.patch||{}).filter(([k])=>['name','studio','role','phone'].includes(k)));
    assert(Object.keys(patch).length,422,'NO_CHANGES','Nenhum campo válido.');
    for(const value of Object.values(patch))assert(typeof value==='string' && value.length<=300,422,'INVALID_PROFILE','Campo de perfil inválido.');
    const result={id:userId,updated:true};
    tx.set(ref,{...patch,version:op.version+1,updatedAt:new Date().toISOString()},{merge:true});
    tx.set(receipt,{result,createdAt:new Date().toISOString()});
    return result;
  });
}
