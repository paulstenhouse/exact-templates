// The store's API is ../backend: a Quickback project compiled to a Cloudflare Worker (Hono, D1, Better Auth).
// This file only runs it for development: `bun server.ts` listens where app.ts's API names it and passes every
// request to `wrangler dev`, which it starts on the next port up with the catalogue seeded. `test` and `verify`
// run it themselves on an empty database, its path in DB. No payment is taken and nothing ships.
//
// It answers at once and holds each request until the Worker is up, so the first call after a cold start waits
// rather than fails.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { API } from './app.ts';

const backend = [process.env.SOFTWEAR_BACKEND, resolve(import.meta.dir, '../backend'), resolve(import.meta.dir, 'backend')]
  .find((dir) => dir && existsSync(resolve(dir, 'wrangler.toml')));
if (!backend) {
  console.error('server.ts: the backend is missing. It is softwear/backend in exact-templates: put a copy beside this app, or name it in SOFTWEAR_BACKEND.');
  process.exit(1);
}
const { hostname, port } = new URL(API);
const upstream = `http://127.0.0.1:${Number(port) + 1}`;

const run = async (argv: string[]) => {
  const child = Bun.spawn(argv, { cwd: backend, stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' });
  const [code, said] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(`${argv.join(' ')} failed in ${backend}: ${said.trim().split('\n').slice(-6).join('\n')}`);
};
const wrangler = resolve(backend, 'node_modules/.bin/wrangler');
const newest = (...paths: string[]): number => Math.max(0, ...paths.map((p) => {
  if (!existsSync(p)) return 0;
  const s = statSync(p);
  return s.isDirectory() ? newest(...readdirSync(p).map((n) => resolve(p, n))) : s.mtimeMs;
}));

// The Worker's local state: where D1 keeps its files. A test's is thrown away with its DB; a hand-run server keeps
// its own, so accounts and orders are still there tomorrow.
const scratch = process.env.DB;
const state = scratch ? `${scratch}.state` : resolve(backend, '.wrangler/dev-state');

async function prepare() {
  if (!existsSync(resolve(backend, 'node_modules'))) await run(['npm', 'install', '--no-audit', '--no-fund']);
  // Local secrets, made once and kept out of git. They are this machine's only.
  const vars = resolve(backend, '.dev.vars');
  if (!existsSync(vars)) writeFileSync(vars, `# Local development only. Never commit.\nBETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\n`);
  // A migrated, seeded database, built once and copied for each run: applying it afresh takes ten seconds.
  const seeded = resolve(backend, '.wrangler/seeded-state'), stamp = resolve(seeded, 'built');
  const sources = newest(resolve(backend, 'quickback/drizzle'), resolve(backend, 'seed'));
  if (!existsSync(stamp) || statSync(stamp).mtimeMs < sources) {
    rmSync(seeded, { recursive: true, force: true });
    for (const db of ['AUTH_DB', 'DB', 'AUDIT_DB']) await run([wrangler, 'd1', 'migrations', 'apply', db, '--local', '--persist-to', seeded]);
    await run([wrangler, 'd1', 'execute', 'DB', '--local', '--persist-to', seeded, '--file', 'seed/catalog.sql']);
    writeFileSync(stamp, '');
  }
  if (scratch) rmSync(state, { recursive: true, force: true });
  if (!existsSync(state)) { mkdirSync(dirname(state), { recursive: true }); cpSync(seeded, state, { recursive: true }); }
}

// `wrangler dev` under a shell that ends it when this process goes, however it goes (a test's stop is a kill).
let worker: ReturnType<typeof Bun.spawn> | null = null;
const stop = () => { try { worker?.kill('SIGTERM'); } catch {} if (scratch) rmSync(state, { recursive: true, force: true }); };
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => { stop(); process.exit(0); });
process.on('exit', stop);

const ready = (async () => {
  await Bun.sleep(0); // the listener below first
  await prepare();
  const dev = `"${wrangler}" dev --port ${Number(port) + 1} --ip 127.0.0.1 --persist-to "${state}" --show-interactive-dev-session=false`;
  worker = Bun.spawn(['sh', '-c', `${dev} & W=$!; trap 'kill $W 2>/dev/null' TERM INT; while kill -0 ${process.pid} 2>/dev/null && kill -0 $W 2>/dev/null; do sleep 0.5; done; kill $W 2>/dev/null`],
    { cwd: backend, stdin: 'ignore', stdout: 'ignore', stderr: process.env.SOFTWEAR_BACKEND_LOG ? 'inherit' : 'ignore' });
  for (let i = 0; i < 600; i++) {
    try { if ((await fetch(`${upstream}/health`)).ok) return; } catch {}
    if (worker.exitCode != null) throw new Error('wrangler dev exited before it answered. Run it by hand to see why: cd ../backend && npx wrangler dev');
    await Bun.sleep(100);
  }
  throw new Error('wrangler dev did not answer in a minute.');
})();
ready.catch((e) => { console.error(`server.ts: ${e.message}`); process.exit(1); });

// A page in development is served from whatever loopback port its tool chose, which the backend's list of trusted
// origins (quickback.config.ts) cannot name ahead. This development server alone answers for them: it presents the
// page to the Worker as the first of that list and gives the reply back to the page's own origin. A deployed
// backend trusts only the origins it lists.
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/, TRUSTED = 'http://127.0.0.1:8765';

Bun.serve({ hostname, port: Number(port), idleTimeout: 120, async fetch(req) {
  await ready;
  const url = new URL(req.url);
  const headers = new Headers(req.headers);
  headers.delete('host');
  const origin = headers.get('origin') ?? '', local = LOOPBACK.test(origin);
  if (local) headers.set('origin', TRUSTED);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const res = await fetch(`${upstream}${url.pathname}${url.search}`, { method: req.method, headers, body: hasBody ? await req.arrayBuffer() : undefined, redirect: 'manual' });
  const out = new Headers(res.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  if (local && out.has('access-control-allow-origin')) out.set('access-control-allow-origin', origin);
  return new Response(res.body, { status: res.status, headers: out });
} });
console.log(`server.ts: ${API} (the Quickback backend in ${backend}, wrangler dev at ${upstream})`);
