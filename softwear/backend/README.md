# Softwear's backend

The store's API: the catalogue, stock, accounts, bags, saved styles, promo codes, orders and the mailing list.
It is a [Quickback](https://quickback.dev) project. The tables and their security rules are declared in
`quickback/`, and `quickback build` compiles them into a Cloudflare Worker (Hono, D1, Better Auth) in `src/`.
The Exact app in `../app` is its only client: the website, the iOS app and the macOS app all call it.

No payment is taken and nothing ships. An order is a record with a number.

## Run it

You need Node, and Bun for the app. Nothing here needs a Cloudflare account.

```sh
cd softwear/backend && npm install        # once
cd ../app && bun server.ts                # the API at http://127.0.0.1:8787, seeded
```

`server.ts` is how the app runs its backend in development. The first run writes `.dev.vars` (a local
`BETTER_AUTH_SECRET`, out of git), applies the migrations to a local D1, seeds it from `seed/catalog.sql`, and
starts `wrangler dev`. It keeps its data in `.wrangler/dev-state`; delete that folder to start again.
`bun exact.mjs test web` and `test ios` start it themselves on an empty database.

To run the Worker without the app:

```sh
npm run db:migrate:local
npx wrangler d1 execute DB --local --file seed/catalog.sql
npm run dev
```

Then, in the app (`../app`):

```sh
bun exact.mjs web          # the site, rebuilt on save
bun exact.mjs ios --run    # the iOS app on a simulator
bun exact.mjs test web     # 30 UI tests against this backend
bun test tools             # the API's rules over HTTP, and the app's data module
```

### Change it

Edit `quickback/`, then compile. `src/` is generated: never edit it.

```sh
npx @quickback-dev/cli build     # asks you to sign in to Quickback the first time
bun scripts/seed.ts              # after changing ../app/catalog.ts: rewrites seed/catalog.sql
```

A build replaces `src/`, which stops a running `wrangler dev`: start `bun server.ts` again after it.

### Staff

Staff are accounts whose `user.role` is `sysadmin`. Sign up in the app, then:

```sh
sh scripts/make-admin.sh you@example.com
```

Sign in again, and that session may write the catalogue and stock, read every order and move it on:

```sh
curl -X POST http://127.0.0.1:8787/api/v1/orders/<id>/ship -H "authorization: Bearer <token>" -H "content-type: application/json" -d '{}'
```

`<token>` is the `set-auth-token` header of `POST /auth/v1/sign-in/email`.

## What it serves

| Route | Who | What |
| --- | --- | --- |
| `GET /api/v1/products` | anyone | The catalogue, 46 styles |
| `GET /api/v1/stock?productSlug=…` | anyone | What is left of each size |
| `POST /api/v1/subscribe`, `POST /api/v1/notify` | anyone | Join the list; ask for a restock note |
| `POST /auth/v1/sign-up/email`, `/sign-in/email`, `/sign-out`, `/update-user` | anyone | Better Auth: email and password |
| `GET /api/v1/me` | a shopper | Their address, name, list membership and welcome code |
| `PUT /api/v1/bag`, `GET /api/v1/bag-items` | a shopper | Their bag |
| `GET`, `POST`, `DELETE /api/v1/saved-styles` | a shopper | Their saved styles |
| `GET /api/v1/promo?code=…` | a shopper | What one code is worth to them |
| `POST /api/v1/checkout` | a shopper | Turn their bag into an order |
| `GET /api/v1/orders`, `/order-lines` | a shopper, staff | Their orders; staff see all |
| `POST /api/v1/orders/:id/ship`, `/deliver`, `/cancel` | staff | Move an order on |
| `POST`, `PATCH /api/v1/products`, `/stock`, `/promo-codes` | staff | Run the shop |
| `GET /api/v1/subscribers`, `/restock-requests` | staff | The lists, with addresses masked for support staff |

`/openapi.json` describes all of it once you are signed in.

## The security model

Each rule is a line in a table's file under `quickback/features/`, not code in a handler.

| Pillar | What it does here | Where |
| --- | --- | --- |
| Firewall | Every query on a shopper's table gets `WHERE owner_id = <the caller>`: bags, saved styles, orders, order lines and promo redemptions. Another shopper's list is empty and their order is refused. It also binds inside actions: checkout reads `bagItems` with no filter of its own and gets only the caller's rows. Staff read past it (`cms.sysadmin`). | `firewall:` in `orders.ts`, `bag-items.ts`, `saved-styles.ts` |
| Access | Who may call what. The catalogue and stock are `PUBLIC` to read and staff's to write. A shopper's tables need a signed-in `USER`. Promo codes cannot be listed by a shopper, so nobody can enumerate them. | `read:`, `create:`, `update:`, `delete:`, and `access:` on each action |
| Guards | Which fields a write may set. An order has none: no route creates or edits one, so a total is only ever the server's arithmetic. A product's `slug` is immutable. An order's `status` changes only through its transitions, `placed → shipped → delivered` or `placed → cancelled`, and those are staff's. | `guards:` and `transitions:` in `orders.ts`, `products.ts` |
| Masking | Mailing-list and restock addresses come back as `a****@e******.com` to support staff (`appmanager`), whole to `sysadmin`. An order's email, name and address are shown to its owner and to staff. | `masking:` in `subscribers.ts`, `restock-requests.ts`, `orders.ts` |

What checkout decides on the server, in `quickback/features/orders/actions/checkout.ts`:

- **Prices.** The client sends where to ship and a promo code. Lines come from the caller's bag, prices from
  `products`.
- **Stock.** Each size is taken with one `UPDATE … WHERE count >= n`, so two orders cannot both take the last
  units, and a `CHECK (count >= 0)` on the column backs that up. A line that cannot be met gives back what the
  earlier lines took.
- **WELCOME15, once.** A redemption row is claimed with an insert that only succeeds when the shopper has none
  (`db.insertWhere … notExists`), under a unique index on `(ownerId, code)`.

`../app/tools/server.test.ts` asks all of this over HTTP.

## How the app is wired to it

- **Origin.** `API_BASE_URL` in `../app/.env`, `http://127.0.0.1:8787`. `app.ts` grants itself that origin
  (`net.fetch`) and one secret (`secret.keep softwear.session`). On iOS, `app.json`'s
  `host.ios.localNetworking` lets a development build reach a loopback or LAN address over `http`. For a phone,
  set `API_BASE_URL` to this Mac's LAN address in `../app/.env.local` and build again.
- **Sign-in.** The Account page takes an email and a password. `app.ts` calls Better Auth's sign-in, and its
  sign-up for an address it has not seen. The signed session token (`set-auth-token`) goes to Exact's secret
  store, which is the Keychain on Apple, and every later call sends it as `Authorization: Bearer`. The app keeps
  no cookie.
- **Catalogue.** `loadCatalog` reads `GET /api/v1/products`. A build has no server to ask, so the pages it
  renders ahead show `../app/catalog.ts`, which is also what `scripts/seed.ts` seeds this backend from.
- **Bag and saved styles.** They stay on the device, as before, so a guest has them. Signed in, each change is
  sent whole (`PUT /api/v1/bag`, `saved-styles`), and signing in on another device brings them back.
- **Checkout.** `placeOrder` sends the bag, then `POST /api/v1/checkout`. A guest is asked to sign in first.
- **Web origins.** The site's own origins are in `trustedOrigins` in `quickback/quickback.config.ts`. In
  development `server.ts` also answers for a page on any loopback port, which is where Exact's tools serve it.

## Files

| Path | What |
| --- | --- |
| `quickback/quickback.config.ts` | The project: Cloudflare, D1, Better Auth with the `bearer` plugin |
| `quickback/features/*/*.ts` | One table each, with its firewall, access, guards and masking |
| `quickback/features/*/actions/*.ts` | `checkout`, `sync` (the bag), `check` (a promo code), `join`, `notify`, `me` |
| `quickback/drizzle/` | The migrations `quickback build` wrote |
| `seed/catalog.sql`, `scripts/seed.ts` | The catalogue, stock and promo codes, written from `../app/catalog.ts` |
| `scripts/make-admin.sh` | Makes an account staff |
| `src/`, `wrangler.toml`, `package.json`, `*.gen.ts`, `reports/`, `AGENTS.md` | Generated by `quickback build` |

## Limits

This is a demonstration. Checkout takes no payment. Joining the list and asking for a restock note send no
email. Sign-up does not verify the address. The sign-in and sign-up rate limits are raised in
`quickback.config.ts` so the app's test run can make a dozen accounts a minute; lower them for a real store.
Taking stock and writing the order are separate statements, since D1 has no transaction across them: a
failure between them is undone in code, not by the database.
