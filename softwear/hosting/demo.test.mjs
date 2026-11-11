import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { demoDenied } from './src/demo-policy.ts';

test('shared accounts cannot change credentials or administer identities, including path aliases', () => {
  for (const path of ['/auth/v1/change-password', '/auth/v1/update-user', '/auth/v1/delete-user', '/auth/v1/admin/set-role', '/auth/v1/sign-up/email', '/api/v1/operator/users', '/api/v1/organization/roster', '/auth/v1/%63hange-password']) assert.equal(demoDenied(path, 'POST'), true, path);
  assert.equal(demoDenied('/auth/v1/sign-in/email', 'POST'), false);
  assert.equal(demoDenied('/auth/v1/sign-out', 'POST'), false);
  assert.equal(demoDenied('/auth/v1/get-session', 'GET'), false);
  assert.equal(demoDenied('/auth/v1/sign-in/email', 'GET'), true);
  assert.equal(demoDenied('/api/v1/products/demo', 'PATCH'), false);
});

test('real migrations and demo reset SQL restore catalogue, stock and sample records repeatedly', () => {
  const result = spawnSync('python3', ['-c', `
import sqlite3, pathlib
root=pathlib.Path('..')
auth=sqlite3.connect(':memory:')
db=sqlite3.connect(':memory:')
for file in sorted((root/'backend/quickback/drizzle/auth').glob('*.sql')): auth.executescript(file.read_text())
for file in sorted((root/'backend/quickback/drizzle/features').glob('*.sql')): db.executescript(file.read_text())
authseed=(root/'.deploy/demo-auth.sql').read_text()
seed=(root/'.deploy/demo-features.sql').read_text()
for attempt in range(2):
 auth.executescript(authseed)
 db.executescript(seed)
 assert db.execute('SELECT count(*) FROM products').fetchone()[0] == 46
 assert db.execute("SELECT count(*) FROM stock WHERE count>0").fetchone()[0] > 0
 assert db.execute("SELECT count(*) FROM products WHERE name='Changed'").fetchone()[0] == 0
 assert db.execute('SELECT count(*) FROM orders').fetchone()[0] == 1
 assert db.execute('SELECT count(*) FROM subscribers').fetchone()[0] == 1
 assert auth.execute("SELECT role FROM user WHERE id='softwear-demo-admin'").fetchone()[0] == 'sysadmin'
 assert auth.execute('SELECT count(*) FROM account').fetchone()[0] == 2
 db.execute('UPDATE stock SET count=0')
 db.execute("UPDATE products SET name='Changed'")
 db.execute('DELETE FROM subscribers')
 db.commit()
assert db.execute("SELECT count(*) FROM stock WHERE count>0").fetchone()[0] == 0
`], { cwd: import.meta.dirname, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
