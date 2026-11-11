# Softwear flagship on Cloudflare

Public site and API origin: **https://softwear.examples.quickback.dev**.

The `softwear-flagship` Worker serves Exact's release assets and proxies API/auth requests to the `softwear` Quickback Worker through a service binding. Exact's native clients can use the same public origin. Both Workers deploy into the account selected by `CLOUDFLARE_ACCOUNT_ID` and the CLI's authentication profile.

## Public demo logins

- Shopper: `shopper@softwear.example` at `/account`.
- CMS admin: `admin@softwear.example` at `/cms/` (redirects to `/account/login`).
- Password for both: `SoftwearDemo2026!`.

The CMS is pinned to the `Softwear demo` organization (`softwear-demo-store`), with the shared admin as its owner. There is no organization picker. This administrative workspace does not change shopper ownership of bags or orders. The reset repairs the workspace and membership as well as the public accounts.

These credentials are intentionally public and appear in the site header. Accounts and shop data are shared with other visitors. Use fictitious details only. Catalogue, stock, promo codes, bags, saved styles, orders, subscribers and restock requests reset at :00 and :30 UTC. The reset restores a sample shopper bag/order, subscriber and restock request. Demo sessions survive the reset; refresh a page to see the restored records.

The public gateway permits sign-in, sign-out, session reads and the read-only organization lookup used by the pinned CMS. New signups, password/profile changes and identity administration are blocked, including for the demo admin. The CMS admin can manage shop data through the generated access rules. `/account` remains the Exact shopper screen; `/account/*` serves Quickback's Account UI. The generated backend has no public workers.dev or preview URL: only the frontend service binding reaches it. `prepare-demo.mjs` derives a deployment policy overlay from the compiler's config, leaving generated files untouched. Always deploy the backend with `demo.wrangler.toml`; deploying its unmodified config would reopen direct ingress.

This is a demonstration. Orders are simulated; nothing is charged or shipped. Use fictitious details when trying checkout. The existing app displays this notice. Email and password accounts work without a real-store verification/fulfilment setup; this deployment is not a production shop.

## Build and deploy again

From the exact-templates root, first initialize the pinned Exact tooling if this is a fresh checkout:

```sh
bun new.mjs --develop softwear
cd softwear/backend && npm install
cd ../hosting && npm ci
```

The current prototype requires Quickback's Exact target, automatic grants and generated bindings (#836–#838), plus the Wrangler KV naming compatibility fix and CMS platform-role/edit-validation fixes (#840) found during this deployment. Until those changes are released, build the CLI from the Quickback checkout and run its compiler with Docker. Never replace the Docker compiler with a host Bun server.

```sh
# In the Quickback checkout:
pnpm --dir packages/cli run build
cd apps/compiler-local && bash dev.sh 3107
```

Then run this flagship's release workflow:

```sh
CLOUDFLARE_ACCOUNT_ID=<account-id> \
QUICKBACK_API_URL=http://127.0.0.1:3107 \
QUICKBACK_CLI=/absolute/path/to/quickback/packages/cli/dist/index.js \
node release.mjs
```

`release.mjs` stages a separate Exact app at `softwear/.deploy/app`, compiles the backend to `softwear/backend/.deploy`, provisions/reuses the dedicated resources, applies pending migrations, deploys the API, builds Exact with the public origin and deploys the frontend. It preserves the local app's client origin and authored source. The CLI still owns migration history under `backend/quickback/drizzle`; compilation does not replace it with a fresh history.

On the first deployment only, generate `BETTER_AUTH_SECRET` into a private temporary JSON file and pass its path as `SOFTWEAR_SECRETS_FILE`. The release script passes that file to `wrangler deploy --secrets-file`. Secret values are never stored in this repository. Subsequent deployments preserve Cloudflare's existing secret when no file is supplied. Do not regenerate it on every release, which would invalidate sessions.

Set `SOFTWEAR_RESET=1` for the first demo deployment or an intentional immediate reset. It applies the same authored reset statements as the scheduled handler, provisions/repairs the two public accounts and restores 46 styles, stock, two promo codes and fictional sample records. Normal releases do not immediately reset inventory; the scheduled reset runs every 30 minutes. Never copy this reset configuration or the public accounts into a real store. Non-demo auth accounts and migration history are not deleted by the reset.

The authored config records the deployed database/KV IDs. A fork targeting another account must provision its own resources and choose its own public domain; it must not reuse this flagship's resource IDs.

## Verify

```sh
bun smoke.mjs
```

This checks pages, deep links, 404s, header credentials, both public logins, a cookie-based CMS session/schema, admin product editing and sample lists, denied staff/identity operations, simulated checkout and persistence across login sessions. It creates a simulated order and signs its sessions out; no payment or real order occurs.

After compiling the backend, `npm test` checks the gateway policy and reset SQL against the actual migrations. After a frontend build (`npm run build`), `npm run test:reset` runs the built scheduled handler twice against isolated Miniflare D1 databases. It does not touch remote data.

Local development keeps using `app/`, the backend's normal local output and the template's existing `bun exact.mjs test web` tests. A public-origin build lowers the auth test limits to 10 sign-ins / 5 sign-ups per minute.

## Hosting behaviour

- Home, catalogue and story use Exact's build-time HTML.
- Known client/dynamic routes get `shell.html` and load live data in the browser.
- Missing files and unmatched routes return a real HTTP 404.
- API/auth/health/CMS/spec requests are forwarded to the generated backend, which owns access checks.
- Exact's Bun renderer is not running in Workers. Request-time product SSR is therefore not part of this static deployment.

The custom domain is attached through Cloudflare Workers Custom Domains, which issues a certificate for the nested hostname. The quickback.dev zone hold remains enabled with subdomains excluded; it was not changed for this deployment. Fresh DNS records can be negatively cached by a local resolver during rollout; compare a public resolver and the certificate status before treating that as a failed deployment.

Live browser checks also created a stock row and edited/restored a product name with its empty Weight field unchanged. The stock test row is disposable and disappears at the next scheduled reset.

See `deployment.json` for the deployed resource identities and versions. No permanent local agent or development server is required after deployment.
