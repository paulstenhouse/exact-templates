import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { authResetStatements, demoPassword, featureResetStatements } from './src/demo-data.ts';
const hosting = dirname(fileURLToPath(import.meta.url));
const backend = resolve(hosting, '../backend/.deploy');
const staging = resolve(hosting, '../.deploy');
const require = createRequire(resolve(backend, 'package.json'));
const { hashPassword } = await import(pathToFileURL(require.resolve('better-auth/crypto')).href);
const hash = await hashPassword(demoPassword);
await mkdir(staging, { recursive: true });
await writeFile(resolve(staging, 'demo-auth.json'), JSON.stringify({ hash }) + '\n');
const catalogue = await readFile(resolve(hosting, '../backend/seed/catalog.sql'), 'utf8');
await writeFile(resolve(staging, 'demo-features.sql'), featureResetStatements(catalogue).join(';\n') + ';\n');
await writeFile(resolve(staging, 'demo-auth.sql'), authResetStatements(hash).join(';\n') + ';\n');
// Deployment policy overlay: keep the generated runtime/config untouched, while
// ensuring this demo's public gateway cannot be bypassed through workers.dev.
const generated = await readFile(resolve(backend, 'wrangler.toml'), 'utf8');
if (!/^name = "softwear"$/m.test(generated)) throw new Error('Refusing demo overlay for another Worker');
if (/^workers_dev\s*=/m.test(generated)) throw new Error('Review generated ingress settings before applying demo overlay');
await writeFile(resolve(backend, 'demo.wrangler.toml'), generated.replace(/^name = "softwear"$/m, '$&\nworkers_dev = false\npreview_urls = false'));
console.log('Prepared public demo accounts, reset SQL and service-only backend deployment policy.');
