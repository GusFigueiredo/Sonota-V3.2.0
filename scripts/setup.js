import { copyFileSync, constants, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Instale Node.js 24 LTS antes de executar o setup.'); process.exit(1);
}
try { copyFileSync('.env.example', '.env', constants.COPYFILE_EXCL); console.log('.env criado a partir do modelo.'); }
catch (error) { if (error.code !== 'EEXIST') throw error; console.log('.env existente preservado.'); }
function npm(args) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')], {stdio:'inherit'})
    : spawnSync('npm', args, {stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const lock of ['package-lock.json', 'mobile/package-lock.json']) {
  if (!existsSync(lock)) { console.error('Arquivo ausente: ' + lock + '. Inclua os lockfiles no commit.'); process.exit(1); }
}
npm(['ci']);
npm(['--prefix', 'mobile', 'ci']);
npm(['run', 'ui:build']);
console.log('Instalação concluída. Configure a credencial Firebase conforme README.md e execute npm run doctor; depois npm start.');
