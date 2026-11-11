# Softwear flagship on Cloudflare

Public site and API origin: **https://softwear.examples.quickback.dev**.

The `softwear-flagship` Worker serves Exact's release assets and proxies API/auth requests to the `softwear` Quickback Worker through a service binding. Exact's native clients can use the same public origin. Both Workers deploy into the account selected by `CLOUDFLARE_ACCOUNT_ID` and the CLI's authentication profile.

This is a demonstration. Orders are simulated; nothing is charged or shipped. Use fictitious details when trying checkout. The existing app displays this notice. Email and password accounts work without a real-store verification/fulfilment setup; this deployment is not a production shop.

## Build and deploy again

From the exact-templates root, first initialize the pinned Exact tooling if this is a fresh checkout:

```sh
bun new.mjs --develop softwear
cd softwear/backend && npm install
cd ../hosting && npm ci
```

The current prototype requires Quickback's Exact target, automatic grants and generated bindings (#836–#838), plus the Wrangler KV naming compatibility fix found during this deployment. Until those changes are released, build the CLI from the Quickback checkout and run its compiler with Docker. Never replace the Docker compiler with a host Bun server.

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

Set `SOFTWEAR_SEED=1` on the first empty database to load `backend/seed/catalog.sql`. The catalogue has 46 styles, stock and the two demonstration promo codes. Normal releases do not reseed inventory.

The authored config records the deployed database/KV IDs. A fork targeting another account must provision its own resources and choose its own public domain; it must not reuse this flagship's resource IDs.

## Verify

```sh
bun smoke.mjs
```

This checks static pages, dynamic deep links, missing assets, the demo notice, the same-origin API proxy, the real D1 catalogue, two fictitious accounts, bag persistence, simulated promo checkout, private order access and persistence across login sessions. It creates a simulated order and signs its sessions out; it does not send a payment or place a real order.

Local development keeps using `app/`, the backend's normal local output and the template's existing `bun exact.mjs test web` tests. A public-origin build lowers the auth test limits to 10 sign-ins / 5 sign-ups per minute.

## Hosting behaviour

- Home, catalogue and story use Exact's build-time HTML.
- Known client/dynamic routes get `shell.html` and load live data in the browser.
- Missing files and unmatched routes return a real HTTP 404.
- API/auth/health/CMS/spec requests are forwarded to the generated backend, which owns access checks.
- Exact's Bun renderer is not running in Workers. Request-time product SSR is therefore not part of this static deployment.

The custom domain is attached through Cloudflare Workers Custom Domains, which issues a certificate for the nested hostname. The quickback.dev zone hold remains enabled with subdomains excluded; it was not changed for this deployment. Fresh DNS records can be negatively cached by a local resolver during rollout; compare a public resolver and the certificate status before treating that as a failed deployment.

See `deployment.json` for the deployed resource identities and versions. No permanent local agent or development server is required after deployment.
