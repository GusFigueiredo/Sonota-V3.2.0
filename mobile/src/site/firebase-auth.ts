import { auth } from '../app/firebase';
import { browserSessionPersistence, setPersistence, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';

type Request = (path: string, options?: any) => Promise<any>;
const messages: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'Informe um e-mail válido.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Entre ou recupere a senha.',
  'auth/weak-password': 'Use uma senha mais forte, com pelo menos 10 caracteres.',
  'auth/network-request-failed': 'Não foi possível conectar ao Firebase.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/requires-recent-login': 'Entre novamente para alterar sua senha.',
};
async function translated<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error: any) {
    if (messages[error.code]) error.message = messages[error.code];
    throw error;
  }
}
async function ready(request: Request) {
  if (!(await request('/auth/options')).firebaseOnly) throw new Error('Reinicie o servidor para ativar o acesso Firebase do site.');
  await auth.authStateReady();
  await setPersistence(auth, browserSessionPersistence);
}
async function finish(user: any, request: Request, data: any = {}) {
  return request('/auth/firebase', { method: 'POST', body: {
    idToken: await user.getIdToken(true),
    ...(data.name ? { name: data.name.trim(), studio: data.studio || '', role: data.role || 'Produtor Musical' } : {}),
  } });
}
export const siteAuth = {
  login: (data: any, request: Request) => translated(async () => {
    await ready(request);
    const { user } = await signInWithEmailAndPassword(auth, data.email.trim(), data.password);
    return finish(user, request);
  }),
  register: (data: any, request: Request) => translated(async () => {
    if (!data.name.trim()) throw new Error('Preencha seu nome.');
    if (data.password.length < 10) throw new Error('A senha deve ter pelo menos 10 caracteres.');
    await ready(request);
    if (!(await request('/auth/options')).registration) throw new Error('O cadastro está desativado.');
    let user;
    try { user = (await createUserWithEmailAndPassword(auth, data.email.trim(), data.password)).user; }
    catch (error: any) {
      // Uma gravação do perfil interrompida não deve exigir outra conta.
      if (error.code !== 'auth/email-already-in-use') throw error;
      user = (await signInWithEmailAndPassword(auth, data.email.trim(), data.password)).user;
    }
    return finish(user, request, data);
  }),
  reset: (email: string) => translated(async () => {
    if (!email.trim()) throw new Error('Preencha o e-mail acima para recuperar sua senha.');
    auth.languageCode = 'pt-BR';
    try { await sendPasswordResetEmail(auth, email.trim()); }
    catch (error: any) { if (error.code !== 'auth/user-not-found') throw error; }
  }),
  logout: (request: Request) => translated(async () => {
    try { await request('/auth/me'); await request('/auth/logout', { method: 'POST' }); }
    catch (error: any) { if (error.status !== 401) throw error; }
    await signOut(auth);
    sessionStorage.removeItem('sonota_csrf');
  }),
  changePassword: (data: any, request: Request) => translated(async () => {
    if (data.newPassword.length < 10) throw new Error('Use pelo menos 10 caracteres na nova senha.');
    const { user: profile } = await request('/auth/me');
    await ready(request);
    let user = auth.currentUser;
    if (!user || user.uid !== profile.id) user = (await signInWithEmailAndPassword(auth, profile.email, data.currentPassword)).user;
    else await reauthenticateWithCredential(user, EmailAuthProvider.credential(profile.email, data.currentPassword));
    await updatePassword(user, data.newPassword);
    return finish(user, request);
  }),
};
