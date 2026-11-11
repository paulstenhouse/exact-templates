import { afterEach, expect, test } from 'bun:test';
import { answer } from '../app.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
// A signed-in shopper: the session token is the store's secret, not an argument.
const store = { get: () => 'token', set: () => {}, forget: () => {} } as never;
const order = () => answer('loadOrder', ['SW-100001', 'ada@example.com'], store, undefined as never, undefined as never);

test('an order the server does not list is not found; a failed read is a failure, not a missing order', async () => {
  globalThis.fetch = (async () => Response.json({ data: [] })) as typeof fetch;
  expect(await order()).toMatchObject({ found: false });
  globalThis.fetch = (async () => Response.json({ detail: 'Temporarily unavailable.' }, { status: 503 })) as typeof fetch;
  await expect(order()).rejects.toThrow('Temporarily unavailable.');
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
  await expect(order()).rejects.toThrow('Can’t reach the store');
});

test('a session the server no longer knows says to sign in again', async () => {
  globalThis.fetch = (async () => Response.json({ detail: 'Authentication required' }, { status: 401 })) as typeof fetch;
  await expect(order()).rejects.toThrow('Your session has ended');
});

test('without a session nothing of an account is asked for', async () => {
  let asked = 0;
  globalThis.fetch = (async () => { asked++; return Response.json({ data: [] }); }) as typeof fetch;
  const signedOut = { get: () => null, set: () => {}, forget: () => {} } as never;
  expect(await answer('loadOrders', ['ada@example.com'], signedOut, undefined as never, undefined as never)).toEqual([]);
  expect(await answer('loadOrder', ['SW-100001', 'ada@example.com'], signedOut, undefined as never, undefined as never)).toMatchObject({ found: false });
  expect(asked).toBe(0);
});
