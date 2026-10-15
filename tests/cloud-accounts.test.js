import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, call, account } from './helpers.js';

function cloud() {
  const docs = new Map(), revoked = new Set();
  const claims = uid => ({ uid, email: uid + '@example.test', auth_time: Date.now()/1000 });
  const check = async uid => { if (revoked.has(uid)) throw Object.assign(new Error('revoked'), {code:'auth/id-token-revoked'}); return claims(uid); };
  const ref = uid => ({ uid, get: async () => ({ exists: docs.has(uid), data: () => docs.get(uid) }) });
  return { docs, revoked, services: {
    firebaseAuth: { verifyIdToken: check, verifySessionCookie: check, createSessionCookie: async token => token },
    firestore: { collection: () => ({ doc: ref }), runTransaction: async fn => fn({ get: r => r.get(), set: (r, data, options) => docs.set(r.uid, options?.merge ? {...docs.get(r.uid),...data} : data) }) },
  } };
}

async function login(base, uid) {
  const r = await call(base, null, 'POST', '/auth/firebase', { idToken: uid, name: 'Pessoa' });
  assert.equal(r.status, 200);
  return { cookie: r.response.headers.get('set-cookie').split(';')[0], csrf: r.data.csrf, user: r.data.user };
}
test('Firebase exclusivo: conta e perfil nunca são criados no SQLite; projetos usam apenas referência de dono', async t => {
  const stub = cloud(), r = await fixture(t, {firebaseOnly:true, cloudServices:stub.services});
  const a = await login(r.base, 'uid-a'), b = await login(r.base, 'uid-b');
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  assert.equal(stub.docs.get('uid-a').name, 'Pessoa');
  assert.equal((await call(r.base,a,'GET','/auth/me')).data.user.id,'uid-a');
  assert.equal((await call(r.base,a,'POST','/clients',{name:'Cliente'})).status,201);
  assert.equal((await call(r.base,a,'GET','/bootstrap')).data.clients.length,1);
  assert.equal((await call(r.base,b,'GET','/bootstrap')).data.clients.length,0);
  const p = (await call(r.base,a,'GET','/profile/firebase')).data.user;
  const changed = await call(r.base,a,'PATCH','/profile',{name:'Nome novo',email:p.email,studio:'',role:p.role,phone:'',notificationPreferences:p.notificationPreferences,version:p.version});
  assert.equal(changed.status,200);
  assert.equal(stub.docs.get('uid-a').name,'Nome novo');
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM users').get().n,0);
  assert.equal((await call(r.base,a,'POST','/auth/logout')).status,204);
  assert.equal((await call(r.base,null,'GET','/auth/me')).status,401);
});
test('Firebase exclusivo: bloqueia login local, cookies antigos, CSRF inválido e token revogado', async t => {
  const stub = cloud(), r = await fixture(t,{firebaseOnly:true,cloudServices:stub.services});
  assert.equal((await call(r.base,null,'POST','/auth/login',{email:'a@example.test',password:'senha'})).status,410);
  assert.equal((await call(r.base,null,'POST','/auth/register',{})).status,410);
  assert.equal((await call(r.base,{cookie:'sonota_session=old'},'GET','/auth/me')).status,401);
  const a = await login(r.base,'uid-a');
  assert.equal((await call(r.base,{...a,csrf:''},'POST','/auth/logout')).status,403);
  stub.revoked.add('uid-a');
  assert.equal((await call(r.base,a,'GET','/auth/me')).status,401);
});

test('Perfil Firebase: foto conserva referência no Firestore e arquivo durante coleta', async t => {
  const stub=cloud(), r=await fixture(t,{firebaseOnly:true,cloudServices:stub.services});
  const a=await login(r.base,'uid-avatar');
  const form=new FormData();
  form.append('metadata','{}');
  form.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')]),'foto.png');
  const uploaded=await call(r.base,a,'POST','/profile/avatar',form);
  assert.equal(uploaded.status,200);
  const fileId=uploaded.data.avatarFileId;
  assert.equal(stub.docs.get('uid-avatar').avatarFileId,fileId);
  assert.equal((await call(r.base,a,'GET','/files/'+fileId)).status,200);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM file_pins WHERE file_id=?').get(fileId).n,1);
  assert.equal((await call(r.base,a,'DELETE','/profile/avatar')).status,200);
  assert.equal(stub.docs.get('uid-avatar').avatarFileId,'');
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM users').get().n,0);
});
