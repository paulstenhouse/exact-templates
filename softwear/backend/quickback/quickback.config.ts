/**
 * Softwear's backend: the store's catalogue, stock, bags, saved styles, orders,
 * promo codes and mailing list, compiled by Quickback into a Cloudflare Worker
 * (Hono + D1 + Better Auth). Edit this folder, then run `npx quickback build`;
 * never edit ../src.
 *
 * Who is who:
 *   - a shopper is any signed-in Better Auth user (email + password). Shoppers
 *     belong to no organization: their rows are theirs by `ownerId`.
 *   - staff are users whose `user.role` is "sysadmin" (see ../scripts/make-admin.sh).
 *     `cms.sysadmin` lets them read past the owner firewall, to run the shop.
 */
// Deployment builds use an isolated output tree; local development keeps its own client origin.
const publicOrigin = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.SOFTWEAR_PUBLIC_ORIGIN;

export default {
    name: "softwear",
    template: "hono",
    build: publicOrigin ? { outputDir: "../.deploy" } : undefined,
    bindings: { vars: publicOrigin ? { BETTER_AUTH_URL: publicOrigin } : {} },
    cms: { sysadmin: true },
    client: {
        target: "exact", origin: publicOrigin ?? "http://127.0.0.1:8787", secret: "softwear.session",
        appEntry: publicOrigin ? "../.deploy/app/app.ts" : undefined,
        bindings: {
            loadCatalog: {
                call: "products.list", shape: "Product", auth: "guest",
                fields: ["slug", "style", "name", "category", "gender", "fabric", "weight", "fit", "description", "details", "colors", "sizes", "priceCents", "compareCents", "tags", "kind", "photo"],
                args: [{ limit: 100, sort: "position,id" }],
            },
            checkPromoRemote: { call: "promoCodes.actions.check", shape: "Promo" },
        },
    },
    // The Exact app's own origins while developing: `bun exact.mjs web` and `serve`.
    // The installed apps send no Origin and sign in with a bearer token.
    trustedOrigins: [
        ...(publicOrigin ? [publicOrigin] : []),
        "http://127.0.0.1:8765",
        "http://localhost:8765",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    providers: {
        runtime: { name: "cloudflare", config: {} },
        database: { name: "cloudflare-d1", config: {
          kvNamespaceId: "296f3fdfb34e4669a68c93ad6a1483f4",
          auditDatabaseId: "7014037f-e568-436f-95d9-5a98c7446fa4",
          featuresDatabaseId: "5cfbe925-33b1-45ef-8382-f147687aa37b",
          authDatabaseId: "0b9cb069-db7b-4341-b5b8-2c1542c308bf", binding: "DB" } },
        // Email and password, as Softwear's sign-in screen asks. `bearer` lets the Exact app,
        // which keeps no cookie jar on a phone, send its session as `Authorization: Bearer`.
        auth: {
            name: "better-auth",
            config: {
                plugins: ["bearer"],
                // Better Auth limits each address to 10 sign-ins and 5 sign-ups a minute by default.
                // The app's test run makes a dozen accounts from one address in that time, so the
                // demo allows more. Take these two lines out for a real store.
                rateLimit: { enabled: true, customRules: { "/sign-in/email": { window: 60, max: publicOrigin ? 10 : 120 }, "/sign-up/email": { window: 60, max: publicOrigin ? 5 : 60 } } },
            },
        },
    },
};
