import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { project, startApi } from './api-fixture.ts';

const exact = resolve(project, process.env.EXACT2 ?? '../exact-release');
const { chromium } = await import(resolve(exact, 'node_modules/playwright-core/index.mjs'));
const dist = resolve(project, process.env.EXACT_WEB_DIST ?? 'target/web-dist');
let browser: any, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  if (!await Bun.file(resolve(dist, 'index.html')).exists()) throw new Error(`Build the web app first: ${dist}`);
  browser = await chromium.launch({ headless: true });
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
    const path = resolve(dist, '.' + new URL(req.url).pathname);
    if (!path.startsWith(dist + '/') && path !== dist) return new Response(null, { status: 404 });
    let file = Bun.file(path);
    if (!await file.exists()) file = Bun.file(resolve(path, 'index.html'));
    // A page the build did not render ahead is the shell, which the client draws, as a static host serves it.
    if (!await file.exists()) file = Bun.file(resolve(dist, 'shell.html'));
    return new Response(file);
  } });
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

async function checkoutPage(fail = false) {
  const api = await startApi();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let release!: () => void, received!: () => void;
  const held = new Promise<void>(r => { release = r; }), sent = new Promise<void>(r => { received = r; });
  const origin = `http://127.0.0.1:${server.port}`;
  await page.route('**/*', async (route: any) => {
    const request = route.request(), url = new URL(request.url());
    // The page calls the API where it was built to; each test has a backend of its own, so its calls go there.
    if (url.origin === origin || !/^\/(api|auth)\/v1\//.test(url.pathname)) return route.continue();
    if (request.method() === 'POST' && url.pathname === '/api/v1/checkout') {
      received();
      await held;
      if (fail) return route.fulfill({ status: 503, contentType: 'application/problem+json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ detail: 'Try again.' }) });
    }
    // Asked as the page asks: with its own headers and no cookie jar, since the app signs in with a bearer token.
    // A call still in flight when its test ends finds the backend gone; it is the page's to lose, not the run's.
    try {
      const reply = await fetch(api.origin + url.pathname + url.search, { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined });
      const headers = Object.fromEntries(reply.headers);
      delete headers['set-cookie'];
      await route.fulfill({ status: reply.status, headers, body: Buffer.from(await reply.arrayBuffer()) });
    } catch { await route.abort().catch(() => {}); }
  });
  // An order is an account's: sign in first, which makes the account on this backend.
  await page.goto(origin);
  await page.getByTestId('nav-account').click();
  await page.getByTestId('signin-email').fill('placed@example.com');
  await page.getByTestId('signin-password').fill('softwear-demo');
  await page.getByTestId('signin').click();
  await page.getByTestId('member').waitFor();
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('card-challenger-eco-fleece-hoodie').click();
  await page.getByTestId('size-S').click();
  await page.getByTestId('add-to-bag').click();
  await page.getByTestId('nav-bag').click();
  await page.getByTestId('checkout').click();
  for (const [id, value] of Object.entries({ 'co-email': 'Receipt@example.com', 'co-name': 'Review', 'co-address': '1 Test St', 'co-city': 'Test', 'co-zip': '00000' })) await page.getByTestId(id).fill(value);
  await page.getByTestId('place-order').click();
  await sent;
  return { page, release, close: async () => { release(); await page.close(); await api.close(); } };
}

test('checkout preserves subsequent additions and a changed promo, and the account stays the one signed in', async () => {
  const fixture = await checkoutPage();
  const { page, release } = fixture;
  try {
    await page.getByTestId('co-email').fill('edited@example.com');
    await page.getByTestId('nav-shop').click();
    await page.getByTestId('card-challenger-eco-fleece-hoodie').click();
    await page.getByTestId('add-to-bag').click();
    await page.getByTestId('nav-shop').click();
    await page.getByTestId('card-go-to-tee').click();
    await page.getByTestId('size-XS').click();
    await page.getByTestId('add-to-bag').click();
    await page.getByTestId('nav-bag').click();
    await page.getByTestId('promo').fill('FLEECE10');
    await page.getByTestId('apply-promo').click();
    release();
    await page.getByTestId('order-account').click();
    expect(await page.getByTestId('member').textContent()).toBe('placed@example.com');
    expect(await page.getByTestId('bag-count').textContent()).toBe('2');
    await page.getByTestId('nav-bag').click();
    expect(await page.getByTestId('line-name-0').textContent()).toBe('Challenger Eco-Fleece Hoodie');
    expect(await page.getByTestId('line-name-1').textContent()).toBe('Go-To Tee');
    await page.getByTestId('promo-note').filter({ hasText: 'FLEECE10 applied: 10% off.' }).waitFor();
  } finally { await fixture.close(); }
}, 60000);

test('removing and re-adding a submitted line keeps the replacement', async () => {
  const fixture = await checkoutPage();
  const { page, release } = fixture;
  try {
    await page.getByTestId('nav-bag').click();
    await page.getByTestId('remove-0').click();
    await page.getByTestId('nav-shop').click();
    await page.getByTestId('card-challenger-eco-fleece-hoodie').click();
    await page.getByTestId('add-to-bag').click();
    release();
    await page.getByTestId('order-title').waitFor();
    expect(await page.getByTestId('bag-count').textContent()).toBe('1');
  } finally { await fixture.close(); }
}, 60000);

test('a rejected checkout preserves all current bag contents and the contact draft', async () => {
  const fixture = await checkoutPage(true);
  const { page, release } = fixture;
  try {
    await page.getByTestId('co-email').fill('edited@example.com');
    release();
    await page.getByTestId('co-error').waitFor();
    expect(await page.getByTestId('bag-count').textContent()).toBe('1');
    expect(await page.getByTestId('co-email').inputValue()).toBe('edited@example.com');
  } finally { await fixture.close(); }
}, 60000);

test('pinch can continue as a one-finger pan and only a completed pull dismisses', async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  try {
    await page.setContent('<style>body{margin:0}zoom-image{width:400px;height:500px}</style><zoom-image></zoom-image>');
    await page.addScriptTag({ content: readFileSync(resolve(project, 'modules/web/index.js'), 'utf8').replaceAll('export ', '') });
    const source = 'data:image/jpeg;base64,' + readFileSync(resolve(project, 'assets/p/challenger-eco-fleece-hoodie.jpg')).toString('base64');
    await page.evaluate((source: string) => {
      const w = window as any;
      w.events = [];
      w.h = w.create('zoom-image', document.querySelector('zoom-image'), JSON.stringify({ source }), (...e: any[]) => w.events.push(e));
    }, source);
    await page.waitForFunction(() => (window as any).h.img.complete && (window as any).h.img.naturalWidth > 0);
    const result = await page.evaluate(() => {
      const w = window as any, h = w.h;
      const fire = (type: string, id: number, x: number, y: number) => h.stage.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
      fire('pointerdown', 1, 100, 200); fire('pointerdown', 2, 300, 200); fire('pointermove', 2, 500, 200);
      const before = h.x;
      fire('pointerup', 2, 500, 200); fire('pointermove', 1, 120, 200);
      const dx = h.x - before;
      fire('pointerup', 1, 120, 200);
      const pulls: number[] = [];
      for (const end of ['pointercancel', 'lostpointercapture', 'pointerup']) {
        h.scale = 1; h.x = 0; h.y = 0; w.apply(h, false); w.events = [];
        fire('pointerdown', 3, 100, 100); fire('pointermove', 3, 100, 210); fire(end, 3, 100, 210);
        pulls.push(w.events.filter((e: any[]) => e[1] === 'dismiss').length);
      }
      return { dx, pulls };
    });
    expect(result.dx).toBeCloseTo(20);
    expect(result.pulls).toEqual([0, 0, 1]);
  } finally { await page.close(); }
});
