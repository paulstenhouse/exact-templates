import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const project = resolve(import.meta.dir, '..');

// The backend on a free port and a database of its own, seeded and thrown away after: server.ts runs it.
export async function startApi() {
  const reserved = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const origin = `http://127.0.0.1:${reserved.port}`;
  reserved.stop(true);
  const scratch = mkdtempSync(join(tmpdir(), 'softwear-api-'));
  const process = Bun.spawn([Bun.argv[0]!, 'server.ts'], {
    cwd: project,
    env: { ...Bun.env, API_BASE_URL: origin, DB: join(scratch, 'db.sqlite') },
    stdout: 'ignore', stderr: 'pipe',
  });
  const close = async () => { process.kill(); await process.exited; rmSync(scratch, { recursive: true, force: true }); };
  // A cold start migrates and seeds a database first, which takes half a minute once.
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(`${origin}/health`, { signal: AbortSignal.timeout(60000) })).ok) return { origin, close }; } catch {}
    if (process.exitCode !== null) break;
    await Bun.sleep(500);
  }
  await close();
  throw new Error(`API did not start: ${await new Response(process.stderr).text()}`);
}
