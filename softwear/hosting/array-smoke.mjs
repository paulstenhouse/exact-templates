// Fictitious temporary product: verifies metadata, JSON round trips and staff access.
import assert from 'node:assert/strict';
import { createClient } from '../backend/.deploy/quickback.client.ts';
import { demoAccounts, demoPassword } from './src/demo-data.ts';
const origin = 'https://softwear.examples.quickback.dev';
function connection() {
  let token = null;
  const client = createClient({ baseUrl: origin, auth: 'bearer', headers: { Origin: origin }, sessionStore: { get: () => token, set: (value) => { token = value; } } });
  return { client, headers: () => ({ Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }) };
}
const admin = connection(), shopper = connection();
let fixture;
try {
  await admin.client.auth.signIn.email({ email: demoAccounts[1].email, password: demoPassword });
  await shopper.client.auth.signIn.email({ email: demoAccounts[0].email, password: demoPassword });
  const registryResponse = await fetch(origin + '/api/v1/schema', { headers: admin.headers() });
  assert.equal(registryResponse.status, 200);
  const registryBody = await registryResponse.json();
  const registry = registryBody.data ?? registryBody;
  const table = registry.tables.products;
  const colorSchema = table.columns.find((column) => column.name === 'colors').jsonSchema;
  assert.equal(colorSchema.type, 'array');
  assert.equal(colorSchema.items.properties.hex.type, 'string');
  assert.equal(table.columns.find((column) => column.name === 'tags').jsonSchema.items.type, 'string');
  console.log('PASS live schema metadata selects repeatable colours and tag chips');
  const source = (await admin.client.products.list({ limit: 1 })).data[0];
  const body = Object.fromEntries(table.guards.createable.map((key) => [key, source[key]]));
  body.slug = 'cms-array-proof-' + crypto.randomUUID();
  body.name = 'Temporary CMS array proof';
  body.position = 99999;
  fixture = await admin.client.products.create(body);
  const colors = [...source.colors].reverse().concat([{ name: 'Editor proof', hex: '#abcdef', photo: '' }]);
  const tags = [...source.tags, 'cms-array-proof'];
  const edited = await fetch(origin + '/api/v1/products/' + fixture.id, { method: 'PATCH', headers: { ...admin.headers(), 'If-Match': fixture.modifiedAt }, body: JSON.stringify({ colors, tags }) });
  assert.equal(edited.status, 200, await edited.text());
  const row = await admin.client.products.get(fixture.id);
  assert.deepEqual(row.colors, colors);
  assert.deepEqual(row.tags, tags);
  console.log('PASS nested colour/photo properties, ordering and string arrays survive save/read');
  const denied = await shopper.client.products.update(fixture.id, { tags: ['denied'] }).then(() => 200, (error) => error.status);
  assert.equal(denied, 403);
  const invalid = await fetch(origin + '/api/v1/products/' + fixture.id, { method: 'PATCH', headers: { ...admin.headers(), 'If-Match': row.modifiedAt }, body: JSON.stringify({ colors: [{ name: 'Bad', hex: 42, photo: '' }] }) });
  assert.equal(invalid.status, 400);
  assert.deepEqual((await admin.client.products.get(fixture.id)).colors, colors);
  console.log('PASS shopper writes and invalid JSON item types are rejected');
} finally {
  try {
    if (fixture) await admin.client.products.delete(fixture.id).catch((error) => { if (error.status !== 404) throw error; });
  } finally {
    await Promise.allSettled([admin.client.auth.signOut(), shopper.client.auth.signOut()]);
  }
}
