// The backend's own rules, asked over HTTP as any client would: what it prices, what it refuses, and who may
// read what. It runs the Quickback Worker in ../../backend on a seeded database of its own (api-fixture.ts).
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { CATALOG } from '../catalog.ts';
import { startApi } from './api-fixture.ts';

let api: Awaited<ReturnType<typeof startApi>>;
beforeAll(async () => { api = await startApi(); }, 120000);
afterAll(async () => { await api?.close(); });

async function request(path: string, { body, method = body === undefined ? 'GET' : 'POST', token = '' }: { body?: unknown; method?: string; token?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(api.origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) as any, token: response.headers.get('set-auth-token') ?? '' };
}
// A new account's session token, as the app keeps it.
async function shopper(email: string) {
  const who = { email, password: 'softwear-demo' };
  await request('/auth/v1/sign-up/email', { body: { ...who, name: '' } });
  const signedIn = await request('/auth/v1/sign-in/email', { body: who });
  expect(signedIn.token).not.toBe('');
  return signedIn.token;
}
const ship = { email: 'review@example.com', name: 'Review', address: '1 Test St', city: 'Test', zip: '00000', shipping: 'standard' };
const line = (slug: string, color: string, size: string, qty: number) => ({ slug, color, size, qty });
async function order(token: string, lines: ReturnType<typeof line>[], promo?: string) {
  expect((await request('/api/v1/bag', { method: 'PUT', token, body: { lines } })).status).toBe(200);
  return request('/api/v1/checkout', { token, body: promo ? { ...ship, promo } : ship });
}
const stock = async (slug: string, size: string) => (await request(`/api/v1/stock?limit=100&productSlug=${slug}`)).body.data.find((s: any) => s.size === size).count;

test('orders aggregate inventory across colours and refuse without consuming other lines', async () => {
  const token = await shopper('stock@example.com');
  const p = CATALOG.find((p) => p.slug === 'challenger-eco-fleece-hoodie')!;
  const [a, b] = p.colors.map((c) => c.name);
  expect(await stock(p.slug, '2XL')).toBe(3);
  // Two colours share the 2XL stock: 3 + 3 is more than there is, and the S line comes back untouched.
  expect((await order(token, [line(p.slug, a!, 'S', 1), line(p.slug, a!, '2XL', 3), line(p.slug, b!, '2XL', 3)])).status).toBe(409);
  expect(await stock(p.slug, '2XL')).toBe(3);
  expect(await stock(p.slug, 'S')).toBe(30);
  const placed = await order(token, [line(p.slug, a!, '2XL', 1), line(p.slug, b!, '2XL', 2)]);
  expect(placed.status).toBe(200);
  expect(placed.body.subtotalCents).toBe(p.priceCents * 3);
  expect(await stock(p.slug, '2XL')).toBe(0);
  expect((await order(token, [line(p.slug, a!, '2XL', 1)])).status).toBe(409);
}, 30000);

test('competing orders cannot both consume the last units', async () => {
  const slug = 'go-to-tee', color = CATALOG.find((p) => p.slug === slug)!.colors[0]!.name;
  const [one, two] = await Promise.all([shopper('race-one@example.com'), shopper('race-two@example.com')]);
  expect(await stock(slug, 'S')).toBe(3);
  const results = await Promise.all([order(one, [line(slug, color, 'S', 3)]), order(two, [line(slug, color, 'S', 3)])]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await stock(slug, 'S')).toBe(0);
}, 30000);

test('the client sends no price: the server prices the order, and WELCOME15 works once per shopper', async () => {
  const token = await shopper('promo@example.com');
  const p = CATALOG[0]!, color = p.colors[0]!.name;
  expect((await request('/api/v1/promo?code=welcome15', { token })).body).toEqual({ code: 'WELCOME15', pct: 15, used: false });
  const first = await order(token, [line(p.slug, color, 'M', 1)], 'WELCOME15');
  expect(first.status).toBe(200);
  expect(first.body.discountCents).toBe(Math.round(p.priceCents * 0.15));
  expect((await request('/api/v1/promo?code=WELCOME15', { token })).body).toEqual({ code: 'WELCOME15', pct: 0, used: true });
  const second = await order(token, [line(p.slug, color, 'M', 1)], 'WELCOME15');
  expect(second.status).toBe(409);
  expect(second.body.code).toBe('PROMO_USED');
  // FLEECE10 is the store's, as often as you like.
  expect((await order(token, [line(p.slug, color, 'M', 1)], 'FLEECE10')).body.discountCents).toBe(Math.round(p.priceCents * 0.1));
  expect((await order(token, [line(p.slug, color, 'M', 1)], 'NOPE')).body.code).toBe('PROMO_UNKNOWN');
}, 30000);

test('a shopper reads and writes only their own rows, and nobody writes an order by hand', async () => {
  const [alice, bob] = await Promise.all([shopper('alice@example.com'), shopper('bob@example.com')]);
  const p = CATALOG[1]!;
  const placed = await order(alice, [line(p.slug, p.colors[0]!.name, p.sizes[1]!, 1)]);
  expect(placed.status).toBe(200);
  const mine = (await request('/api/v1/orders', { token: alice })).body.data;
  expect(mine.map((o: any) => o.number)).toEqual([placed.body.number]);
  // Firewall: Bob's list is empty and Alice's order is not his to open.
  expect((await request('/api/v1/orders', { token: bob })).body.data).toEqual([]);
  expect((await request(`/api/v1/orders/${mine[0].id}`, { token: bob })).status).toBeGreaterThanOrEqual(403);
  expect((await request('/api/v1/order-lines', { token: bob })).body.data).toEqual([]);
  // Guards and access: no route creates or edits an order, and its transitions are staff's.
  expect((await request('/api/v1/orders', { token: alice, body: { number: 'SW-1', totalCents: 1 } })).status).toBe(405);
  expect((await request(`/api/v1/orders/${mine[0].id}`, { token: alice, method: 'PATCH', body: { totalCents: 1 } })).status).toBe(405);
  expect((await request(`/api/v1/orders/${mine[0].id}/ship`, { token: alice, body: {} })).status).toBe(403);
  // The catalogue, stock and promo codes are staff's to write; the codes and the mailing list are staff's to read.
  expect((await request(`/api/v1/products/prod_${p.slug}`, { token: alice, method: 'PATCH', body: { priceCents: 1 } })).status).toBe(403);
  expect((await request('/api/v1/promo-codes', { token: alice })).status).toBe(403);
  expect((await request('/api/v1/subscribers', { token: alice })).status).toBe(403);
  // Signed out, nothing of a shopper's is readable at all.
  for (const path of ['/api/v1/orders', '/api/v1/bag-items', '/api/v1/saved-styles', '/api/v1/me']) expect((await request(path)).status).toBe(401);
}, 30000);

test('anyone may join the list or ask for a restock note, once, with a real address', async () => {
  expect((await request('/api/v1/subscribe', { body: { email: 'Fan@Example.com' } })).body).toEqual({ code: 'WELCOME15', returning: false });
  expect((await request('/api/v1/subscribe', { body: { email: 'fan@example.com' } })).body).toEqual({ code: 'WELCOME15', returning: true });
  expect((await request('/api/v1/subscribe', { body: { email: 'not an address' } })).status).toBe(400);
  expect((await request('/api/v1/notify', { body: { email: 'fan@example.com', slug: 'go-to-tee' } })).status).toBe(200);
  expect((await request('/api/v1/notify', { body: { email: 'fan@example.com', slug: 'no-such-thing' } })).status).toBe(404);
  for (const body of ['null', '[]', '"text"', '{']) {
    const response = await fetch(`${api.origin}/api/v1/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect(response.status, body).toBe(400);
  }
}, 30000);
