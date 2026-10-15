import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let failures = 0;
function check(ok, message) { console.log((ok ? 'OK: ' : 'FALTA: ') + message); if (!ok) failures++; }
check(Number(process.versions.node.split('.')[0]) === 24, 'Node.js 24');
for (const name of ['.env','node_modules/firebase-admin/package.json','mobile/node_modules/@angular/core/package.json','public/ionic/index.html']) {
  check(existsSync(path.join(root,name)), name + ' (npm run setup prepara os arquivos locais)');
}
const project = process.env.FIREBASE_PROJECT_ID;
check(Boolean(project), 'FIREBASE_PROJECT_ID no .env');
const client = readFileSync(path.join(root,'mobile/src/app/firebase.ts'),'utf8');
const clientProject = client.match(/projectId:\s*['"]([^'"]+)['"]/)?.[1];
check(Boolean(project) && clientProject === project, 'Frontend e servidor usam o mesmo projeto Firebase');
const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (credentialPath) {
  try {
    const credential = JSON.parse(readFileSync(path.resolve(root,credentialPath),'utf8'));
    check(credential.type === 'service_account' && Boolean(credential.private_key) && Boolean(credential.client_email), 'Credencial administrativa válida em formato (conteúdo não exibido)');
    check(credential.project_id === project, 'Credencial pertence ao projeto configurado');
  } catch { check(false, 'Arquivo de credencial ausente ou JSON inválido. Consulte README.md'); }
} else { check(false, 'Defina GOOGLE_APPLICATION_CREDENTIALS no .env para o arquivo privado desta máquina'); }
console.log('Verificação local: não comprova permissões remotas nem acesso à internet.');
console.log('IA e áudio são opcionais e precisam de instalação própria quando habilitados.');
process.exitCode = failures ? 1 : 0;
