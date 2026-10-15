import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('../mobile/node_modules/typescript');
const compiled = ts.transpileModule(readFileSync(new URL('../mobile/src/site/firebase-auth.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture() {
  const calls=[], state={signup:0,signin:0,failProfile:false,exists:false,signinError:null};
  const user={uid:'uid',email:'pessoa@example.test',getIdToken:async()=> 'token'};
  const auth={authStateReady:async()=>{},currentUser:user};
  const sdk={setPersistence:async()=>{},browserSessionPersistence:'session',
    signInWithEmailAndPassword:async()=>{state.signin++;if(state.signinError)throw state.signinError;return {user};},
    createUserWithEmailAndPassword:async()=>{state.signup++;if(state.exists)throw {code:'auth/email-already-in-use'};state.exists=true;return {user};},
    sendPasswordResetEmail:async(a,email)=>calls.push(['reset',email]),
    signOut:async()=>calls.push(['signout']),EmailAuthProvider:{credential:(email,password)=>({email,password})},
    reauthenticateWithCredential:async()=>calls.push(['reauth']),updatePassword:async()=>calls.push(['password']),
  };
  const exports={};
  vm.runInNewContext(compiled,{exports,sessionStorage:{removeItem:()=>calls.push(['clear'])},require:name=>name==='firebase/auth'?sdk:{auth}});
  const request=async(path,options)=>{
    calls.push([path,options]);
    if(path==='/auth/options')return {firebaseOnly:true,registration:true};
    if(path==='/auth/firebase'&&state.failProfile)throw new Error('Firestore indisponível');
    return {user:{id:'uid',email:user.email}};
  };
  return {site:exports.siteAuth,state,calls,request};
}
test('Site: cadastro envia perfil e token, nunca senha ao backend, e retoma gravação interrompida',async()=>{
  const {site,state,calls,request}=fixture();
  const data={name:'Pessoa',email:'pessoa@example.test',password:'senha-secreta123',role:'Músico',studio:'Estúdio'};
  state.failProfile=true;
  await assert.rejects(site.register(data,request));
  state.failProfile=false;
  await site.register(data,request);
  assert.equal(state.signin,1);
  const sent=calls.filter(c=>c[0]==='/auth/firebase');
  assert.equal(sent[1][1].body.role,'Músico');
  assert.equal(JSON.stringify(calls).includes(data.password),false);
});
test('Site: erro Firebase não ativa login local',async()=>{
  const {site,state,calls,request}=fixture();
  state.signinError={code:'auth/invalid-credential'};
  await assert.rejects(site.login({email:'pessoa@example.test',password:'errada'},request));
  assert.equal(calls.some(c=>c[0]==='/auth/login'),false);
});
test('Site: recuperação, troca de senha e logout usam Firebase',async()=>{
  const {site,calls,request}=fixture();
  await assert.rejects(site.reset(' '));
  await site.reset(' pessoa@example.test ');
  assert.equal(calls[0][1],'pessoa@example.test');
  await site.changePassword({currentPassword:'antiga',newPassword:'nova-senha-123'},request);
  assert.ok(calls.find(c=>c[0]==='reauth'));
  assert.ok(calls.find(c=>c[0]==='password'));
  assert.ok(calls.find(c=>c[0]==='/auth/firebase'));
  await site.logout(request);
  assert.deepEqual(calls.slice(-2),[['signout'],['clear']]);
});
