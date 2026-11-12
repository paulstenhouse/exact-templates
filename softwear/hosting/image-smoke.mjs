// Read-only photo/configuration proof against the public demo.
import assert from 'node:assert/strict';
import { createClient } from '../backend/.deploy/quickback.client.ts';
import { demoAccounts, demoPassword } from './src/demo-data.ts';
const origin = 'https://softwear.examples.quickback.dev';
let token;
const client = createClient({ baseUrl: origin, auth: 'bearer', headers: { Origin: origin }, sessionStore: { get: () => token, set: (value) => { token = value; } } });
try {
  await client.auth.signIn.email({ email: demoAccounts[1].email, password: demoPassword });
  const response = await fetch(origin + '/api/v1/schema', { headers: { Origin: origin, Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  const table = (body.data ?? body).tables.products;
  assert.equal(table.inputHints.photo, 'image:/assets/p/');
  assert.equal(table.inputHints['colors.photo'], 'image:/assets/p/');
  const products = (await client.products.list({ limit: 100 })).data;
  const product = products.find((item) => item.photo === 'burnout-french-terry-hooded-pullover.jpg');
  assert.ok(product, 'screenshot product still exists');
  const variant = products.flatMap((item) => item.colors).find((color) => color.photo);
  assert.ok(variant, 'catalogue includes a colour photo');
  for (const filename of [product.photo, variant.photo]) {
    const photo = await fetch(origin + '/assets/p/' + encodeURIComponent(filename));
    assert.equal(photo.status, 200, filename);
    assert.match(photo.headers.get('content-type'), /^image\/jpeg/);
    assert.ok((await photo.arrayBuffer()).byteLength > 1000);
  }
  console.log('PASS live product/colour photo hints and existing JPEG assets');
} finally {
  await client.auth.signOut();
}
