import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { assert, AppError } from './errors.js';
import { cookieOptions } from './auth.js';
import { profileSchema } from './validation.js';

const cookieName = 'sonota_firebase';
const csrfFor = cookie => createHash('sha256').update(cookie).digest('hex');
const input = z.object({ idToken: z.string().min(1).max(16384), name: z.string().trim().min(1).max(160).optional(), studio: z.string().trim().max(300).optional(), role: z.string().trim().max(300).optional() }).strict();
async function services(config) {
  return config.cloudServices || await import('./firebase-admin.js');
}
function publicProfile(data, claims) {
  return { id: claims.uid, email: claims.email, name: data.name, studio: data.studio || '',
    role: data.role || 'Produtor Musical', phone: data.phone || '', avatarFileId: data.avatarFileId || '',
    notificationPreferences: data.notificationPreferences || { deadlines: true, payments: true, prototypes: true, documents: true },
    version: data.version || 1, authProvider: 'firebase' };
}
async function verify(config, token, session = false) {
  try {
    const { firebaseAuth } = await services(config);
    const claims = await (session ? firebaseAuth.verifySessionCookie(token, true) : firebaseAuth.verifyIdToken(token, true));
    assert(typeof claims.uid === 'string' && !claims.uid.includes('/') && typeof claims.email === 'string', 401, 'INVALID_FIREBASE_TOKEN', 'Entre novamente no Firebase.');
    return claims;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.code?.startsWith('auth/') && !['auth/internal-error', 'auth/insufficient-permission'].includes(error.code)) throw new AppError(401, 'INVALID_FIREBASE_TOKEN', 'A sessão expirou. Entre novamente.');
    throw new AppError(503, 'FIREBASE_UNAVAILABLE', 'Não foi possível conectar ao Firebase. Tente novamente.');
  }
}
export function cloudAccounts(db, config, limiter, files) {
  const router = Router();
  router.get('/auth/options', (req, res) => res.json({ registration: config.registration, firebaseLogin: true, firebaseOnly: true }));
  router.post(['/auth/register', '/auth/login', '/auth/password'], (req, res) => res.status(410).json({ error: { code: 'FIREBASE_ONLY', message: 'Use o acesso Firebase em /app/.' } }));
  router.post('/auth/firebase', limiter, async (req, res) => {
    const data = input.parse(req.body);
    const claims = await verify(config, data.idToken);
    const { firebaseAuth, firestore } = await services(config);
    const ref = firestore.collection('usuarios').doc(claims.uid);
    const user = await firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) return publicProfile(snap.data(), claims);
      assert(config.registration, 403, 'REGISTRATION_DISABLED', 'Cadastro desativado.');
      assert(data.name, 422, 'PROFILE_REQUIRED', 'Informe seu nome para concluir o cadastro.');
      const profile = publicProfile({ name: data.name, studio: data.studio, role: data.role }, claims);
      tx.set(ref, { ...profile, firebaseUid: claims.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return profile;
    });
    const age = Date.now() / 1000 - claims.auth_time;
    assert(Number.isFinite(age) && age >= -60 && age < 300, 401, 'RECENT_LOGIN_REQUIRED', 'Entre novamente para iniciar uma sessão.');
    const maxAge = Math.min(config.sessionHours * 3600000, 14 * 86400000);
    const cookie = await firebaseAuth.createSessionCookie(data.idToken, { expiresIn: maxAge });
    res.cookie(cookieName, cookie, { ...cookieOptions(config), maxAge });
    res.json({ user, csrf: csrfFor(cookie) });
  });
  router.use(async (req, res, next) => {
    if (req.path === '/health') return next();
    const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    assert(cookie && cookie.length < 16384, 401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
    const claims = await verify(config, cookie, true);
    req.session = { csrf: csrfFor(cookie) };
    if (!['GET', 'HEAD'].includes(req.method)) assert(req.headers['x-csrf-token'] === req.session.csrf, 403, 'CSRF_INVALID', 'Recarregue a página e tente novamente.');
    req.firebaseClaims = claims;
    if (req.path === '/auth/logout') return next();
    // Referência de propriedade apenas; não cria conta, perfil ou senha no SQLite.
    const legacy = db.prepare('SELECT id FROM owners WHERE firebase_uid=?').get(claims.uid);
    req.userId = legacy?.id || claims.uid;
    db.prepare('INSERT OR IGNORE INTO owners(id,firebase_uid) VALUES (?,?)').run(req.userId,claims.uid);
    const { firestore } = await services(config);
    const snap = await firestore.collection('usuarios').doc(claims.uid).get();
    assert(snap.exists, 422, 'PROFILE_REQUIRED', 'Conclua seu cadastro no login.');
    req.cloudProfile = publicProfile(snap.data(), claims);
    next();
  });
  router.post('/auth/logout', (req, res) => { res.clearCookie(cookieName, cookieOptions(config)); res.sendStatus(204); });
  router.get(['/auth/me', '/profile/firebase'], (req, res) => res.json({ user: req.cloudProfile, csrf: req.session.csrf }));
  router.patch('/profile', async (req, res) => {
    const data = profileSchema.parse(req.body);
    assert(data.email.toLowerCase() === req.firebaseClaims.email.toLowerCase(), 409, 'FIREBASE_EMAIL_MANAGED', 'O e-mail é gerenciado pelo Firebase.');
    const { firestore } = await services(config);
    const ref = firestore.collection('usuarios').doc(req.firebaseClaims.uid);
    const result = await firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      assert(snap.exists && snap.data().version === data.version, 409, 'VERSION_CONFLICT', 'Recarregue o perfil antes de salvar.');
      const updated = publicProfile({ ...snap.data(), ...data, version: data.version + 1 }, req.firebaseClaims);
      tx.set(ref, { ...updated, updatedAt: new Date().toISOString() }, { merge: true });
      return updated;
    });
    res.json(result);
  });
  async function setAvatar(req, fileId) {
    const { firestore } = await services(config);
    const ref = firestore.collection('usuarios').doc(req.firebaseClaims.uid);
    return firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      assert(snap.exists, 422, 'PROFILE_REQUIRED', 'Conclua seu cadastro.');
      const updated = publicProfile({ ...snap.data(), avatarFileId: fileId, version: (snap.data().version || 1) + 1 },req.firebaseClaims);
      tx.set(ref,{...updated,updatedAt:new Date().toISOString()},{merge:true});
      return updated;
    });
  }
  router.post('/profile/avatar', files.middleware, async (req,res) => {
    const file=await files.stage(req,'document',{category:'perfil'});
    assert(file.mime.startsWith('image/'),415,'IMAGE_REQUIRED','Use PNG ou JPG.');
    files.insert(file);
    db.prepare('INSERT INTO file_pins VALUES (?)').run(file.id);
    try {
      const result=await setAvatar(req,file.id);
      file.committed=true;
      res.json(result);
    } catch(error) {
      db.prepare('DELETE FROM files WHERE id=?').run(file.id);
      throw error;
    }
  });
  router.delete('/profile/avatar', async (req,res) => {
    const result=await setAvatar(req,'');
    // Mantém os arquivos anteriores para não perder referências em edições concorrentes.
    res.json(result);
  });
  return router;
}
