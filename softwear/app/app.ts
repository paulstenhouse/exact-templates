import type { Answer, Result, Sources, Store } from './app.contract.d.ts';
import { CATALOG } from './catalog.ts';
// The backend's own generated client (vendored: see its header) and type tree (`client: true` in ../backend/quickback/quickback.config.ts):
// every path, method, query and body below is checked against the compiled API, and so is every reply's shape.
import { createClient, QuickbackError, type Client, type TokenStore } from './quickback.client.ts';
import type { Api, Qb } from '@backend/quickback.gen.ts';

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
type Joined = Result<'subscribe'>;
type Placed = Result<'placeOrder'>;
type Promo = Result<'checkPromo'>;
type LineStock = Result<'loadBagStock'>[number];
type Notified = Result<'notifyMe'>;
type Saved = Result<'syncSaved'>;

const NO_ACCOUNT: Account = { ok: false, error: '', email: '', name: '', code: '', memberSince: '', subscribed: false };
const NOT_SIGNED_IN: SignedIn = { ok: false, error: '', email: '', bag: [], saved: [] };
const NO_ORDER: Order = { found: false, id: '', email: '', name: '', placedAt: '', status: '', shipping: '', subtotalCents: 0, discountCents: 0, shippingCents: 0, totalCents: 0, lines: [] };
const ADDRESS_PLEASE = 'Enter an email address, like you@example.com.';
const SIGN_IN_AGAIN = 'Your session has ended. Sign out, then sign in again.';
// `INVALID_EMAIL` is the subscribe/notify actions' own ActionError code: it is not in this compile's `Qb.ProblemCode`.
const BAD_ADDRESS: ReadonlyArray<string> = ['VALIDATION_ERROR', 'INVALID_EMAIL'] satisfies ReadonlyArray<Qb.ProblemCode | 'INVALID_EMAIL'>;

// Exact's fetch, given its deadline, and never a cached reply: a mutation's refresh must reach the API.
const exactFetch = ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, exactTimeout: 10000, cache: 'no-store' })) as typeof fetch;
// The secret store as the client's session store. Exact hands the store to each answer, so a client is made per answer.
const keep = (store: Store): TokenStore => ({ get: () => store.get(SESSION), set: (t) => (t ? store.set(SESSION, t) : store.forget(SESSION)) });
// A guest's calls carry no session, even when one is kept (a stale one would be refused).
const NONE: TokenStore = { get: () => null, set: () => {} };
const api = (session: TokenStore = NONE): Client => createClient({ baseUrl: API, auth: 'bearer', fetch: exactFetch, sessionStore: session });

type Failed = { status: number; error: string; code: string };
// Why a call failed: the problem document's `detail` (RFC 9457) is the sentence to show. At build there is no server
// (`bake`), which a source lets through so the page renders without that answer and asks again at launch.
function failed(e: unknown, signedIn = false): Failed {
  if ((e as { code?: string }).code === 'bake') throw e;
  if (e instanceof QuickbackError) {
    const said = e.problem?.detail ?? `The store answered ${e.status}.`;
    return { status: e.status, error: e.status === 401 && signedIn ? SIGN_IN_AGAIN : said, code: e.problem?.code ?? '' };
  }
  return { status: 0, error: 'Can’t reach the store right now. Try again in a moment.', code: '' };
}
const addressOr = (f: Failed) => (BAD_ADDRESS.includes(f.code) ? ADDRESS_PLEASE : f.error);
const fail = (signedIn = false) => (e: unknown): never => { throw new Error(failed(e, signedIn).error); };

const toProduct = (p: Api.products.Row): Product => ({
  slug: p.slug, style: p.style, name: p.name, category: p.category, gender: p.gender, fabric: p.fabric, weight: p.weight, fit: p.fit,
  description: p.description, details: p.details, colors: p.colors, sizes: p.sizes, priceCents: p.priceCents, compareCents: p.compareCents,
  tags: p.tags, kind: p.kind, photo: p.photo,
});
const toOrder = (o: Api.orders.Row, lines: Api.orderLines.Row[]): Order => ({
  found: true, id: o.number, email: o.email, name: o.shipName, placedAt: o.placedAt, status: o.status, shipping: o.shippingMethod,
  subtotalCents: o.subtotalCents, discountCents: o.discountCents, shippingCents: o.shippingCents, totalCents: o.totalCents,
  lines: lines.filter((l) => l.orderNumber === o.number).map((l) => ({ slug: l.productSlug, name: l.name, color: l.color, size: l.size, qty: l.qty, priceCents: l.priceCents })),
});
// A bag line is `slug|colour|size|qty`, the contract's own encoding.
const toLine = (v: Api.bagItems.Row) => `${v.productSlug}|${v.color}|${v.size}|${v.qty}`;
const fromLine = (line: string): Api.bagItems.actions.sync.Input['lines'][number] => { const [slug, color, size, qty] = line.split('|'); return { slug: slug ?? '', color: color ?? '', size: size ?? '', qty: Number(qty) }; };

// The signed-in shopper as the Account page shows them.
async function me(client: Client): Promise<Account> {
  try { return { ok: true, error: '', ...(await client.account.actions.me()) }; }
  catch (e) { return { ...NO_ACCOUNT, error: failed(e, true).error }; }
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
    // `position,id`, not `position`: in this compile (0.72.7) a lone unprefixed field sorts DESCENDING unless `?order=asc`
    // is sent, and the client has no `order`. A comma takes the multi-sort path, where unprefixed is ascending.
    try { return (await api().products.list({ limit: 100, sort: 'position,id' })).data.map(toProduct); }
    catch (e) { failed(e); return CATALOG; }
  },
  // What is left of each size, asked when a product page renders. A failed read fails the resource: the page then
  // shows every size and says nothing about stock.
  loadStock: async ([slug]): Promise<Stock> => {
    if (!slug) return { slug: '', ready: false, sizes: [] };
    const found = (await api().stock.list({ limit: 100, filter: { productSlug: slug } }).catch(fail())).data;
    if (found.length === 0) throw new Error('No such product.');
    return { slug, ready: true, sizes: found.map((s) => ({ size: s.size, count: s.count })) };
  },
  // What is left of each line in the bag, by its `slug|colour|size` key. While someone is signed in the bag is
  // also theirs on the server: each change is sent whole, so it is there on their next device and is what
  // checkout reads. A failed read fails the resource: the bag then says nothing about stock, and the order is
  // checked when it is placed.
  loadBagStock: async ([bag, member], store): Promise<LineStock[]> => {
    if (bag.length === 0 && !member) return [];
    const lines = bag.map(fromLine);
    if (member && session(store)) await api(keep(store)).bagItems.actions.sync({ lines }).catch(failed);
    if (lines.length === 0) return [];
    const left = (await api().stock.list({ limit: 100, filter: { 'productSlug.in': [...new Set(lines.map((l) => l.slug))] } }).catch(fail())).data;
    return lines.map((l) => ({ key: `${l.slug}|${l.color}|${l.size}`, count: left.find((s) => s.productSlug === l.slug && s.size === l.size)?.count ?? 0 }));
  },
  // A promo code's worth to this shopper, from the server: the codes are not listed anywhere, and WELCOME15 is
  // worth nothing to someone who has used it. An empty code is worth nothing and asks nothing.
  checkPromo: async ([code, member], store): Promise<Promo> => {
    if (!code) return { code: '', pct: 0, used: false };
    if (!member || !session(store)) return { code, pct: 0, used: false };
    return api(keep(store)).promoCodes.actions.check({ code }).catch(fail(true));
  },
  notifyMe: async ([email, slug]): Promise<Notified> => {
    try { await api().restockRequests.actions.notify({ email, slug }); return { ok: true, error: '', slug }; }
    catch (e) { return { ok: false, error: addressOr(failed(e)), slug }; }
  },
  subscribe: async ([email]): Promise<Joined> => {
    try { return { ok: true, error: '', ...(await api().subscribers.actions.join({ email })) }; }
    catch (e) { return { ok: false, error: addressOr(failed(e)), code: '', returning: false }; }
  },
  // Sign in, or make the account on first sight: Better Auth's email and password. An address it has not seen and
  // a wrong password are refused alike, so a refusal is followed by a sign-up; if that makes nothing new, the
  // password was wrong. The client saves the session token (`set-auth-token` under /auth/v1) to the secret store;
  // the answer carries what the shopper kept on the server. Better Auth's routes are not in the type tree, so these
  // three calls are `request()`, untyped.
  signIn: async ([email, password], store): Promise<SignedIn> => {
    const address = email.trim().toLowerCase(), body = { email: address, password };
    if (password.length < 8) return { ...NOT_SIGNED_IN, error: 'Choose a password of 8 characters or more.' };
    store.forget(SESSION);
    const client = api({ get: () => null, set: keep(store).set });
    const signIn = () => client.request('POST', '/auth/v1/sign-in/email', { body }).then(() => null, failed);
    let refused = await signIn();
    if (refused?.status === 401) {
      const made = await client.request('POST', '/auth/v1/sign-up/email', { body: { ...body, name: '' } }).then(() => null, failed);
      if (made) return { ...NOT_SIGNED_IN, error: addressOr(made) };
      store.forget(SESSION); // sign-up's own session: the sign-in below is the one kept
      refused = await signIn();
    }
    if (refused) return { ...NOT_SIGNED_IN, error: refused.status === 401 ? 'That password doesn’t match this email.' : addressOr(refused) };
    if (!session(store)) return { ...NOT_SIGNED_IN, error: 'The store signed you in without a session. Try again.' };
    const shopper = api(keep(store));
    const [bag, saved] = await Promise.all([shopper.bagItems.list({ limit: 100 }).catch(() => null), shopper.savedStyles.list({ limit: 100 }).catch(() => null)]);
    return { ok: true, error: '', email: address, bag: bag?.data.map(toLine) ?? [], saved: saved?.data.map((s) => s.productSlug) ?? [] };
  },
  signOut: async (_args, store) => {
    const token = session(store);
    store.forget(SESSION);
    if (token) await api({ get: () => token, set: () => {} }).request('POST', '/auth/v1/sign-out', { body: {} }).catch(failed);
    return { ok: true };
  },
  loadAccount: async ([member], store): Promise<Account> => {
    if (!member) return NO_ACCOUNT;
    return session(store) ? me(api(keep(store))) : { ...NO_ACCOUNT, error: SIGN_IN_AGAIN };
  },
  saveName: async ([_member, name], store): Promise<Account> => {
    if (!session(store)) return { ...NO_ACCOUNT, error: SIGN_IN_AGAIN };
    const client = api(keep(store));
    const refused = await client.request('POST', '/auth/v1/update-user', { body: { name: name.slice(0, 80) } }).then(() => null, (e) => failed(e, true));
    return refused ? { ...NO_ACCOUNT, error: refused.error } : me(client);
  },
  // The saved styles, kept on the device and, signed in, on the server: what the server has is made to match.
  syncSaved: async ([_member, saved], store): Promise<Saved> => {
    if (!session(store)) return { ok: false };
    const client = api(keep(store));
    const kept = await client.savedStyles.list({ limit: 100 }).catch(() => null);
    if (!kept) return { ok: false };
    await Promise.all([
      ...saved.filter((slug) => !kept.data.some((k) => k.productSlug === slug)).map((slug) => client.savedStyles.create({ productSlug: slug }).catch(failed)),
      ...kept.data.filter((k) => !saved.includes(k.productSlug)).map((k) => client.savedStyles.delete(k.id).catch(failed)),
    ]);
    return { ok: true };
  },
  // A shopper's orders are theirs alone: the API's firewall answers only the caller's rows.
  loadOrders: async ([member], store): Promise<Order[]> => {
    if (!member || !session(store)) return [];
    const client = api(keep(store));
    const found = (await client.orders.list({ limit: 100, sort: '-placedAt' }).catch(fail(true))).data;
    if (found.length === 0) return [];
    const lines = (await client.orderLines.list({ limit: 100, filter: { 'orderNumber.in': found.map((o) => o.number) } }).catch(fail(true))).data;
    return found.map((o) => toOrder(o, lines));
  },
  loadOrder: async ([id, member], store): Promise<Order> => {
    if (!id || !member || !session(store)) return NO_ORDER;
    const client = api(keep(store));
    const [found] = (await client.orders.list({ limit: 100, filter: { number: id } }).catch(fail(true))).data;
    if (!found) return NO_ORDER;
    const lines = (await client.orderLines.list({ limit: 100, filter: { orderNumber: id } }).catch(fail(true))).data;
    return toOrder(found, lines);
  },
  // The order is the server's to make: it is sent where to ship and a code, never a price. The bag goes first,
  // so what checkout reads is exactly what was on screen at the press.
  placeOrder: async ([email, name, address, city, zip, shipping, lines, promo], store): Promise<Placed> => {
    if (!session(store)) return { ok: false, error: 'Sign in to place your order.', id: '' };
    const client = api(keep(store));
    try {
      await client.bagItems.actions.sync({ lines: lines.map(fromLine) });
      const placed = await client.orders.actions.checkout({ email, name, address, city, zip, shipping: shipping === 'express' ? 'express' : 'standard', ...(promo ? { promo } : {}) });
      return { ok: true, error: '', id: placed.number };
    } catch (e) { return { ok: false, error: failed(e, true).error, id: '' }; }
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
