import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const hosting = dirname(fileURLToPath(import.meta.url));
const root = resolve(hosting, '..');
const origin = 'https://softwear.examples.quickback.dev';
const cli = process.env.QUICKBACK_CLI;
const env = { ...process.env, SOFTWEAR_PUBLIC_ORIGIN: origin, API_BASE_URL: origin };
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function quickback(args) {
  run(cli ? 'node' : 'quickback', cli ? [cli, ...args] : args, resolve(root, 'backend'));
}
run('node', ['prepare.mjs'], hosting);
quickback(['build']);
quickback(['deploy', '--skip-deploy']);
const backend = resolve(root, 'backend/.deploy');
run('npm', ['install', '--no-audit', '--no-fund'], backend);
run('npm', ['run', 'db:migrate:remote'], backend);
if (process.env.SOFTWEAR_SEED === '1') run('npx', ['wrangler', 'd1', 'execute', 'DB', '--remote', '--file', '../seed/catalog.sql', '--yes'], backend);
const deployArgs = ['wrangler', 'deploy'];
if (process.env.SOFTWEAR_SECRETS_FILE) deployArgs.push('--secrets-file', process.env.SOFTWEAR_SECRETS_FILE);
run('npx', deployArgs, backend);
run('bun', ['exact.mjs', 'web-build', '--out', 'target/web-dist'], resolve(root, '.deploy/app'));
run('npm', ['run', 'typecheck'], hosting);
run('npm', ['run', 'deploy'], hosting);
