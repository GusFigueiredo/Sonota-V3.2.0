// Teste real opt-in: cria e remove SOMENTE sua própria conta temporária.
// Executar: node --env-file=.env scripts/validar-login-firebase.js
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { firebaseAuth, firestore } from '../src/firebase-admin.js';

const config = readFileSync(new URL('../mobile/src/app/firebase.ts', import.meta.url), 'utf8');
const apiKey = config.match(/apiKey\s*:\s*['"]([^'"]+)['"]/)?.[1];
assert(apiKey, 'firebaseConfig sem apiKey');
const email = `sonota-teste-${randomUUID()}@example.com`;
const password = `Aa1!${randomUUID()}`;
const nextPassword = `Bb2!${randomUUID()}`;
const dataDir = await mkdtemp(path.join(tmpdir(), 'sonota-firebase-real-'));
let runtime, server, uid;
async function firebasePassword(value) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: value, returnSecureToken: true }), signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, data: await response.json() };
}
try {
  // Admin cria apenas a conta descartável; login usa a API pública e senha real.
  uid = (await firebaseAuth.createUser({ email, password })).uid;
  runtime = createApp({ dataDir, registration: true, audioEnabled: false, ollamaUrl: '' });
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  runtime.config.origins.push(`http://127.0.0.1:${server.address().port}`);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '', csrf = '';
  async function api(route, method = 'GET', body) {
    const response = await fetch(base + route, { method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    const data = response.status === 204 ? null : await response.json();
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    if (data?.csrf) csrf = data.csrf;
    assert(response.ok, `${route}: ${response.status} ${data?.error?.code || ''}`);
    return data;
  }
  const signin = await firebasePassword(password);
  assert.equal(signin.status, 200, `Firebase: ${signin.data.error?.message}`);
  const first = await api('/auth/firebase', 'POST', { idToken: signin.data.idToken, name: 'Teste temporário Sonota' });
  assert.equal(first.user.authProvider, 'firebase');
  assert.equal((await api('/auth/me')).user.id, first.user.id);
  const siteSession = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(siteSession.status, 200);
  assert.equal((await siteSession.json()).user.id, first.user.id);
  const profile = (await api('/profile/firebase')).user;
  await api('/profile', 'PATCH', { name: 'Perfil validado', email: profile.email, phone: profile.phone,
    studio: profile.studio, role: profile.role, notificationPreferences: profile.notificationPreferences, version: profile.version });
  assert.equal((await api('/profile/firebase')).user.name, 'Perfil validado');
  await api('/auth/logout', 'POST');
  cookie = csrf = '';
  await firebaseAuth.updateUser(uid, { password: nextPassword });
  assert.notEqual((await firebasePassword(password)).status, 200);
  const updated = await firebasePassword(nextPassword);
  assert.equal(updated.status, 200);
  const second = await api('/auth/firebase', 'POST', { idToken: updated.data.idToken });
  assert.equal(second.user.id, first.user.id);

  assert.equal(runtime.db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  assert.equal(runtime.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  console.log('OK: login real, sessão, perfil Firestore, edição, logout e nova senha Firebase.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (runtime) await runtime.close();
  try {
    if (uid) {
      await firestore.collection('usuarios').doc(uid).delete();
      await firebaseAuth.deleteUser(uid);
      console.log('Conta e perfil temporários removidos.');
    }
  } finally {
    await firestore.terminate();
    await rm(dataDir, { recursive: true, force: true });
  }
}
