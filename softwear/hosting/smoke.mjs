// Run with Bun after a release: uses the generated client and fictitious demo accounts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '../backend/.deploy/quickback.client.ts';
const origin = process.env.SOFTWEAR_PUBLIC_ORIGIN ?? 'https://softwear.examples.quickback.dev';
const report = { origin, checks: [] };
function passed(name) { report.checks.push(name); console.log('PASS ' + name); }
for (const [path, status] of [['/', 200], ['/shop', 200], ['/story', 200], ['/account', 200], ['/p/challenger-eco-fleece-hoodie', 200], ['/not-a-route', 404], ['/missing-file.js', 404]]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, status, path);
}
passed('static pages, dynamic deep links and real 404s');
const home = await (await fetch(origin)).text();
assert.match(home, /Orders are simulated/);
const script = await fetch(origin + '/app.js');
assert.equal(script.status, 200);
assert.match(script.headers.get('content-type') ?? '', /javascript/);
passed('demo notice and frontend bundle');
assert.equal((await (await fetch(origin + '/health')).json()).status, 'ok');
passed('same-origin backend service binding');
function connection() {
  let token = null;
  return createClient({ baseUrl: origin, auth: 'bearer', headers: { Origin: origin }, sessionStore: { get: () => token, set: (next) => { token = next; } } });
}
const guest = connection();
const products = (await guest.products.list({ limit: 100, sort: 'position,id' })).data;
assert.equal(products.length, 46);
passed('46 products from remote D1');
const chosen = products[0];
const sizes = (await guest.stock.list({ limit: 100, filter: { productSlug: chosen.slug } })).data;
const stock = sizes.find((row) => row.count > 1);
assert.ok(stock);
const accounts = [0, 1].map((index) => ({ email: `flagship-${randomUUID()}-${index}@example.test`, password: randomUUID() + 'aA!', name: 'Demo Test Shopper' }));
const [a, b] = [connection(), connection()];
for (const [index, client] of [a, b].entries()) {
  await client.auth.signUp.email(accounts[index]);
  await client.auth.signIn.email({ email: accounts[index].email, password: accounts[index].password });
}
passed('signup and persisted bearer sessions for two shoppers');
await a.bagItems.actions.sync({ lines: [{ slug: chosen.slug, color: chosen.colors[0].name, size: stock.size, qty: 1 }] });
assert.equal((await a.bagItems.list()).data.length, 1);
assert.equal((await b.bagItems.list()).data.length, 0);
passed('bag persistence and account isolation');
const placed = await a.orders.actions.checkout({ email: accounts[0].email, name: 'Demo Shopper', address: '1 Demo Street', city: 'Example', zip: '00000', shipping: 'standard', promo: 'WELCOME15' });
assert.equal(placed.subtotalCents, chosen.priceCents);
assert.ok(placed.discountCents > 0);
assert.equal(placed.totalCents, placed.subtotalCents - placed.discountCents + placed.shippingCents);
passed('server-priced simulated checkout and promo');
const orders = (await a.orders.list()).data;
const order = orders.find((row) => row.number === placed.number);
assert.ok(order);
assert.equal((await b.orders.list()).data.some((row) => row.number === placed.number), false);
const inaccessible = await b.orders.get(order.id).then(() => 200, (error) => error.status);
assert.ok([403, 404].includes(inaccessible));
const unauthenticated = await guest.orders.list().then(() => 200, (error) => error.status);
assert.ok([401, 403].includes(unauthenticated));
passed('private order retrieval and denied cross-account/guest access');
const returned = connection();
await returned.auth.signIn.email({ email: accounts[0].email, password: accounts[0].password });
assert.ok((await returned.orders.list()).data.some((row) => row.number === placed.number));
passed('orders survive a new login session');
await Promise.all([a.auth.signOut(), b.auth.signOut(), returned.auth.signOut()]);
console.log(JSON.stringify(report, null, 2));
