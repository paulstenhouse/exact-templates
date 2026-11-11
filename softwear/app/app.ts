import type { Answer, Result, Sources, Store } from './app.contract.d.ts';
import { CATALOG } from './catalog.ts';

// The API's origin, a setting (app.json's "env"): the environment's value, else .env.local's, else .env's.
// It is the Quickback backend in ../backend (server.ts runs it for development). It is inlined into the
// module on every host, so it is public: never a secret.
export const API = import.meta.env.API_BASE_URL;
// The store's API, and the one secret this module keeps: the signed session token Better Auth gives at sign-in.
// It is the Keychain's on Apple and the page's localStorage on the web, and it is never in an answer.
export const grants = [`net.fetch ${API}`, 'secret.keep softwear.session'].join('\n');
const SESSION = 'softwear.session';

type Product = Result<'loadCatalog'>[number];
type Stock = Result<'loadStock'>;
type Account = Result<'loadAccount'>;
type SignedIn = Result<'signIn'>;
type Order = Result<'loadOrder'>;
type Line = Order['lines'][number];
type Joined = Result<'subscribe'>;
type Placed = Result<'placeOrder'>;
type Promo = Result<'checkPromo'>;
type LineStock = Result<'loadBagStock'>[number];
type Notified = Result<'notifyMe'>;
type Saved = Result<'syncSaved'>;

const NO_ACCOUNT: Account = { ok: false, error: '', email: '', name: '', code: '', memberSince: '', subscribed: false };
const NOT_SIGNED_IN: SignedIn = { ok: false, error: '', email: '', bag: [], saved: [] };
const NO_ORDER: Order = { found: false, id: '', email: '', name: '', placedAt: '', status: '', shipping: '', subtotalCents: 0, discountCents: 0, shippingCents: 0, totalCents: 0, lines: [] };
const ADDRESS_PLEASE = 'Enter an email address, like you@example.com.', BAD_ADDRESS = ['VALIDATION_ERROR', 'INVALID_EMAIL'];
const SIGN_IN_AGAIN = 'Your session has ended. Sign out, then sign in again.';

type Answered = { ok: true; status: number; body: unknown; token: string } | { ok: false; status: number; error: string; code: string };
// One call to the API: a reply with its JSON, or why it failed. `token` sends the session as a bearer; the API
// answers a failure as a problem document (RFC 9457) whose `detail` is the sentence to show. At build there is
// no server (`bake`), which a source lets through so the page renders without that answer and asks again at launch.
async function call(path: string, init: RequestInit = {}, token = ''): Promise<Answered> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...init, exactTimeout: 10000, headers });
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown; message?: unknown; code?: unknown };
    if (res.ok) return { ok: true, status: res.status, body, token: res.headers.get('set-auth-token') ?? '' };
    const said = typeof body?.detail === 'string' ? body.detail : typeof body?.message === 'string' ? body.message : `The store answered ${res.status}.`;
    return { ok: false, status: res.status, error: res.status === 401 && token ? SIGN_IN_AGAIN : said, code: typeof body?.code === 'string' ? body.code : '' };
  } catch (e) {
    if ((e as { code?: string }).code === 'bake') throw e;
    return { ok: false, status: 0, error: 'Can’t reach the store right now. Try again in a moment.', code: '' };
  }
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const fresh: RequestInit = { cache: 'no-store' };

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : 0);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
// A list reply's rows: `{ data: [...] }`.
const rows = (body: unknown): Record<string, unknown>[] => (isRecord(body) && Array.isArray(body.data) ? body.data.filter(isRecord) : []);
const list = (name: string, query = '') => `/api/v1/${name}?limit=100${query}`;

function toProduct(v: Record<string, unknown>): Product {
  return {
    slug: str(v.slug), style: str(v.style), name: str(v.name), category: str(v.category), gender: str(v.gender), fabric: str(v.fabric),
    weight: str(v.weight), fit: str(v.fit), description: str(v.description), details: strs(v.details),
    colors: Array.isArray(v.colors) ? v.colors.filter(isRecord).map((c) => ({ name: str(c.name), hex: str(c.hex), photo: str(c.photo) })) : [],
    sizes: strs(v.sizes), priceCents: int(v.priceCents), compareCents: int(v.compareCents), tags: strs(v.tags), kind: str(v.kind), photo: str(v.photo),
  };
}
function toOrder(v: Record<string, unknown>, lines: Record<string, unknown>[]): Order {
  const number = str(v.number);
  return {
    found: true, id: number, email: str(v.email), name: str(v.shipName), placedAt: str(v.placedAt), status: str(v.status), shipping: str(v.shippingMethod),
    subtotalCents: int(v.subtotalCents), discountCents: int(v.discountCents), shippingCents: int(v.shippingCents), totalCents: int(v.totalCents),
    lines: lines.filter((l) => l.orderNumber === number).map((l): Line => ({ slug: str(l.productSlug), name: str(l.name), color: str(l.color), size: str(l.size), qty: int(l.qty), priceCents: int(l.priceCents) })),
  };
}
// A bag line is `slug|colour|size|qty`, the contract's own encoding.
const toLine = (v: Record<string, unknown>) => `${str(v.productSlug)}|${str(v.color)}|${str(v.size)}|${int(v.qty)}`;
const fromLine = (line: string) => { const [slug, color, size, qty] = line.split('|'); return { slug: slug ?? '', color: color ?? '', size: size ?? '', qty: Number(qty) }; };

// The signed-in shopper as the Account page shows them.
async function me(token: string): Promise<Account> {
  const r = await call('/api/v1/me', fresh, token);
  if (!r.ok) return { ...NO_ACCOUNT, error: r.error };
  const v = r.body as Record<string, unknown>;
  return { ok: true, error: '', email: str(v.email), name: str(v.name), code: str(v.code), memberSince: str(v.memberSince), subscribed: v.subscribed === true };
}

// Hermes (the iOS and Android apps) answers the app. Bun, which renders the site ahead and bakes every build's first
// frame, is told to ask at launch (`bake`), so the placeholder, the site, stands in what it renders. Anything else is a
// browser, which answers the site.
const BAKE = Object.assign(new Error('the host is known at launch'), { code: 'bake' });
const session = (store: Store) => store.get(SESSION) ?? '';
const sources: Sources = {
  loadHost: async () => {
    const g = globalThis as { HermesInternal?: unknown; Bun?: unknown };
    if (typeof g.HermesInternal !== 'undefined') return { app: true };
    if (typeof g.Bun !== 'undefined') throw BAKE;
    return { app: false };
  },
  // The catalogue is the backend's `products`, in the shop's order. Without an answer (a build renders its pages
  // ahead with no server to ask; a phone may be offline) the shop shows catalog.ts, the copy the backend was
  // seeded from: stock, prices at checkout and orders are still only ever the server's.
  loadCatalog: async () => {
    const r = await call(list('products', '&sort=position&order=asc'), fresh);
    return r.ok ? rows(r.body).map(toProduct) : CATALOG;
  },
  // What is left of each size, asked when a product page renders. A failed read fails the resource: the page then
  // shows every size and says nothing about stock.
  loadStock: async ([slug]): Promise<Stock> => {
    if (!slug) return { slug: '', ready: false, sizes: [] };
    // A mutation refresh must reach the API even inside a page cache.
    const r = await call(list('stock', `&productSlug=${encodeURIComponent(slug)}`), fresh);
    if (!r.ok) throw new Error(r.error);
    const found = rows(r.body);
    if (found.length === 0) throw new Error('No such product.');
    return { slug, ready: true, sizes: found.map((s) => ({ size: str(s.size), count: int(s.count) })) };
  },
  // What is left of each line in the bag, by its `slug|colour|size` key. While someone is signed in the bag is
  // also theirs on the server: each change is sent whole, so it is there on their next device and is what
  // checkout reads. A failed read fails the resource: the bag then says nothing about stock, and the order is
  // checked when it is placed.
  loadBagStock: async ([bag, member], store): Promise<LineStock[]> => {
    if (bag.length === 0 && !member) return [];
    const lines = bag.map(fromLine), token = member ? session(store) : '';
    if (token) await call('/api/v1/bag', json('PUT', { lines }), token);
    if (lines.length === 0) return [];
    const slugs = [...new Set(lines.map((l) => l.slug))];
    const r = await call(list('stock', `&productSlug.in=${slugs.map(encodeURIComponent).join(',')}`), fresh);
    if (!r.ok) throw new Error(r.error);
    const left = rows(r.body);
    return lines.map((l) => ({ key: `${l.slug}|${l.color}|${l.size}`, count: int(left.find((s) => s.productSlug === l.slug && s.size === l.size)?.count) }));
  },
  // A promo code's worth to this shopper, from the server: the codes are not listed anywhere, and WELCOME15 is
  // worth nothing to someone who has used it. An empty code is worth nothing and asks nothing.
  checkPromo: async ([code, member], store): Promise<Promo> => {
    if (!code) return { code: '', pct: 0, used: false };
    const token = member ? session(store) : '';
    if (!token) return { code, pct: 0, used: false };
    const r = await call(`/api/v1/promo?code=${encodeURIComponent(code)}`, fresh, token);
    if (!r.ok) throw new Error(r.error);
    const body = r.body as { code?: unknown; pct?: unknown; used?: unknown };
    return { code: str(body.code), pct: int(body.pct), used: body.used === true };
  },
  notifyMe: async ([email, slug]): Promise<Notified> => {
    const r = await call('/api/v1/notify', json('POST', { email, slug }));
    if (!r.ok) return { ok: false, error: BAD_ADDRESS.includes(r.code) ? ADDRESS_PLEASE : r.error, slug };
    return { ok: true, error: '', slug };
  },
  subscribe: async ([email]): Promise<Joined> => {
    const r = await call('/api/v1/subscribe', json('POST', { email }));
    if (!r.ok) return { ok: false, error: BAD_ADDRESS.includes(r.code) ? ADDRESS_PLEASE : r.error, code: '', returning: false };
    const body = r.body as { code?: unknown; returning?: unknown };
    return { ok: true, error: '', code: str(body.code), returning: body.returning === true };
  },
  // Sign in, or make the account on first sight: Better Auth's email and password. An address it has not seen and
  // a wrong password are refused alike, so a refusal is followed by a sign-up; if that makes nothing new, the
  // password was wrong. The session token goes to the secret store; the answer carries what the shopper kept on
  // the server.
  signIn: async ([email, password], store): Promise<SignedIn> => {
    const address = email.trim().toLowerCase(), body = { email: address, password };
    if (password.length < 8) return { ...NOT_SIGNED_IN, error: 'Choose a password of 8 characters or more.' };
    let r = await call('/auth/v1/sign-in/email', json('POST', body));
    if (!r.ok && r.status === 401) {
      const made = await call('/auth/v1/sign-up/email', json('POST', { ...body, name: '' }));
      if (!made.ok) return { ...NOT_SIGNED_IN, error: BAD_ADDRESS.includes(made.code) ? ADDRESS_PLEASE : made.error };
      r = await call('/auth/v1/sign-in/email', json('POST', body));
    }
    if (!r.ok) return { ...NOT_SIGNED_IN, error: r.status === 401 ? 'That password doesn’t match this email.' : BAD_ADDRESS.includes(r.code) ? ADDRESS_PLEASE : r.error };
    if (!r.token) return { ...NOT_SIGNED_IN, error: 'The store signed you in without a session. Try again.' };
    store.set(SESSION, r.token);
    const [bag, saved] = await Promise.all([call(list('bag-items'), fresh, r.token), call(list('saved-styles'), fresh, r.token)]);
    return { ok: true, error: '', email: address, bag: bag.ok ? rows(bag.body).map(toLine) : [], saved: saved.ok ? rows(saved.body).map((s) => str(s.productSlug)) : [] };
  },
  signOut: async (_args, store) => {
    const token = session(store);
    store.forget(SESSION);
    if (token) await call('/auth/v1/sign-out', json('POST', {}), token);
    return { ok: true };
  },
  loadAccount: async ([member], store): Promise<Account> => {
    if (!member) return NO_ACCOUNT;
    const token = session(store);
    return token ? me(token) : { ...NO_ACCOUNT, error: SIGN_IN_AGAIN };
  },
  saveName: async ([_member, name], store): Promise<Account> => {
    const token = session(store);
    if (!token) return { ...NO_ACCOUNT, error: SIGN_IN_AGAIN };
    const r = await call('/auth/v1/update-user', json('POST', { name: name.slice(0, 80) }), token);
    return r.ok ? me(token) : { ...NO_ACCOUNT, error: r.error };
  },
  // The saved styles, kept on the device and, signed in, on the server: what the server has is made to match.
  syncSaved: async ([_member, saved], store): Promise<Saved> => {
    const token = session(store);
    if (!token) return { ok: false };
    const r = await call(list('saved-styles'), fresh, token);
    if (!r.ok) return { ok: false };
    const kept = rows(r.body);
    await Promise.all([
      ...saved.filter((slug) => !kept.some((k) => k.productSlug === slug)).map((slug) => call('/api/v1/saved-styles', json('POST', { productSlug: slug }), token)),
      ...kept.filter((k) => !saved.includes(str(k.productSlug))).map((k) => call(`/api/v1/saved-styles/${encodeURIComponent(str(k.id))}`, { method: 'DELETE' }, token)),
    ]);
    return { ok: true };
  },
  // A shopper's orders are theirs alone: the API's firewall answers only the caller's rows.
  loadOrders: async ([member], store): Promise<Order[]> => {
    const token = member ? session(store) : '';
    if (!token) return [];
    const r = await call(list('orders', '&sort=-placedAt'), fresh, token);
    if (!r.ok) throw new Error(r.error);
    const found = rows(r.body);
    if (found.length === 0) return [];
    const lines = await call(list('order-lines', `&orderNumber.in=${found.map((o) => encodeURIComponent(str(o.number))).join(',')}`), fresh, token);
    if (!lines.ok) throw new Error(lines.error);
    return found.map((o) => toOrder(o, rows(lines.body)));
  },
  loadOrder: async ([id, member], store): Promise<Order> => {
    const token = member ? session(store) : '';
    if (!id || !token) return NO_ORDER;
    const r = await call(list('orders', `&number=${encodeURIComponent(id)}`), fresh, token);
    if (!r.ok) throw new Error(r.error);
    const [found] = rows(r.body);
    if (!found) return NO_ORDER;
    const lines = await call(list('order-lines', `&orderNumber=${encodeURIComponent(id)}`), fresh, token);
    if (!lines.ok) throw new Error(lines.error);
    return toOrder(found, rows(lines.body));
  },
  // The order is the server's to make: it is sent where to ship and a code, never a price. The bag goes first,
  // so what checkout reads is exactly what was on screen at the press.
  placeOrder: async ([email, name, address, city, zip, shipping, lines, promo], store): Promise<Placed> => {
    const token = session(store);
    if (!token) return { ok: false, error: 'Sign in to place your order.', id: '' };
    const sent = await call('/api/v1/bag', json('PUT', { lines: lines.map(fromLine) }), token);
    if (!sent.ok) return { ok: false, error: sent.error, id: '' };
    const r = await call('/api/v1/checkout', json('POST', { email, name, address, city, zip, shipping: shipping === 'express' ? 'express' : 'standard', ...(promo ? { promo } : {}) }), token);
    if (!r.ok) return { ok: false, error: r.error, id: '' };
    return { ok: true, error: '', id: str((r.body as { number?: unknown }).number) };
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
