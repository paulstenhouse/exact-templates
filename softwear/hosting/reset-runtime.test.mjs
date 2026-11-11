// Runs the built scheduled handler against isolated local D1 databases.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(import.meta.dirname, '../backend/.deploy/package.json'));
const { Miniflare } = require('miniflare');
const contents = await readFile(resolve(import.meta.dirname, '.cloudflare/output/v0/workers/default/bundle/index.js'), 'utf8');
const mf = new Miniflare({ workers: [{ config: { name: 'demo-reset-test', compatibilityDate: '2026-11-11', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents } } }, env: { DEMO_DB: { type: 'd1', id: 'test-features' }, DEMO_AUTH: { type: 'd1', id: 'test-auth' } } } }] });
try {
  const db = await mf.getD1Database('DEMO_DB');
  const auth = await mf.getD1Database('DEMO_AUTH');
  for (const [database, name] of [[db, 'features'], [auth, 'auth']]) {
    const directory = resolve(import.meta.dirname, '../backend/quickback/drizzle', name);
    for (const file of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
      const schema = (await readFile(resolve(directory, file), 'utf8')).replace(/^--.*$/gm, '');
      await database.batch(schema.split(';').map((sql) => sql.trim()).filter(Boolean).map((sql) => database.prepare(sql)));
    }
  }
  const worker = await mf.getWorker();
  for (let attempt = 0; attempt < 2; attempt++) {
    await worker.scheduled({ cron: '*/30 * * * *' });
    assert.equal(await db.prepare('SELECT count(*) AS count FROM products').first('count'), 46);
    assert.equal(await db.prepare('SELECT count(*) AS count FROM orders').first('count'), 1);
    assert.equal(await db.prepare("SELECT count(*) AS count FROM products WHERE name='Changed'").first('count'), 0);
    assert.equal(await auth.prepare("SELECT role FROM user WHERE id='softwear-demo-admin'").first('role'), 'sysadmin');
    await db.prepare("UPDATE products SET name='Changed'").run();
  }
  console.log('PASS built scheduled handler resets isolated D1 twice and restores demo accounts/data');
} finally { await mf.dispose(); }
