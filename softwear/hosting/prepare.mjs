import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoAccounts, demoPassword } from './src/demo-data.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(root, '.deploy/app');
await rm(app, { recursive: true, force: true });
await mkdir(dirname(app), { recursive: true });
const excluded = new Set(['target', 'node_modules', '.exact', '.git', 'dist', 'apple', 'android', 'linux', '.cargo']);
await cp(resolve(root, 'app'), app, { recursive: true, filter: (path) => !excluded.has(basename(path)) && !basename(path).startsWith('.env') });
const manifest = JSON.parse(await readFile(resolve(app, 'app.json'), 'utf8'));
manifest.typescript = { ...manifest.typescript, sources: { ...manifest.typescript?.sources, backend: relative(app, resolve(root, 'backend/.deploy')) } };
await writeFile(resolve(app, 'app.json'), JSON.stringify(manifest, null, 2) + '\n');
const config = JSON.parse(await readFile(resolve(app, 'tsconfig.json'), 'utf8'));
config.compilerOptions.paths['@backend/*'] = ['backend/*', relative(app, resolve(root, 'backend/.deploy')) + '/*'];
await writeFile(resolve(app, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n');
// The staged production app is a public demo; keep the local template empty.
const contractPath = resolve(app, 'app.contract');
let contract = await readFile(contractPath, 'utf8');
for (const [field, value] of [['signinDraft', demoAccounts[0].email], ['passwordDraft', demoPassword]]) {
  const original = `state ${field} = ""`;
  if (!contract.includes(original)) throw new Error(`Review demo prefill for ${field}`);
  contract = contract.replace(original, `state ${field} = ${JSON.stringify(value)}`);
}
await writeFile(contractPath, contract);
console.log('Prepared isolated Exact deployment source at ' + relative(root, app));
