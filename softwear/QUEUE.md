# Softwear follow-up

- Verify an app generated from the template on iOS, Android and macOS and add native screenshots.
- Before adapting this into a live store: take payment at checkout, send the list and restock emails, verify a new account's address, and lower the sign-in rate limits `backend/quickback/quickback.config.ts` raises for the tests.
- `new.mjs` copies only `app/`, so an app made from the template has no backend: copy `softwear/backend` beside it (`server.ts` looks in `../backend` and `./backend`, or `SOFTWEAR_BACKEND`). Teach `new.mjs` to copy it.
- Run `bun exact.mjs verify` and `verify ios` on the app with the Quickback backend; only `test web`, `test ios` and the `tools/` tests have been run since it replaced the Bun server.
- Checkout's stock take and order insert are separate D1 statements, undone in code on failure. Move stock to a Quickback `ledger` so the reservation is one statement.
- Web flagship deployed at https://softwear.examples.quickback.dev. Use `hosting/README.md` for subsequent releases. Native distribution remains separate.

- Investigate the 12 largest-text overlap findings involving the bag toast and product content.
- Investigate the web DOM adoption refusal on filtered catalogue pages. Distinguish expected stock/order network-failure diagnostics in regression tests from unexpected runtime refusals.
- Before moving the pin past `1cbce180d4`: on `expo/exact` `4f5cc4abf1` and later, `web-build` fails with `TypeError: Invalid URL` in `historyURL` (`host/web/navigation.js`), which builds `new URL(location.origin + path)` while pages render under Bun, whose `location.origin` is empty (`host/web-js/render.mjs`). Move the pin once Exact fixes that.
- `bun exact.mjs share` refuses this app as it stands: the build is a release, and with an update store it needs `deploy.signing.keys`. Exact's `share` could build a tester's binary without them, as it starts its own stream anyway.
