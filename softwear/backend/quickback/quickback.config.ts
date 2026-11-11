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
export default {
    name: "softwear",
    template: "hono",
    cms: { sysadmin: true },
    // The Exact app's own origins while developing: `bun exact.mjs web` and `serve`.
    // The installed apps send no Origin and sign in with a bearer token.
    trustedOrigins: [
        "http://127.0.0.1:8765",
        "http://localhost:8765",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    providers: {
        runtime: { name: "cloudflare", config: {} },
        database: { name: "cloudflare-d1", config: { binding: "DB" } },
        // Email and password, as Softwear's sign-in screen asks. `bearer` lets the Exact app,
        // which keeps no cookie jar on a phone, send its session as `Authorization: Bearer`.
        auth: {
            name: "better-auth",
            config: {
                plugins: ["bearer"],
                // Better Auth limits each address to 10 sign-ins and 5 sign-ups a minute by default.
                // The app's test run makes a dozen accounts from one address in that time, so the
                // demo allows more. Take these two lines out for a real store.
                rateLimit: { enabled: true, customRules: { "/sign-in/email": { window: 60, max: 120 }, "/sign-up/email": { window: 60, max: 60 } } },
            },
        },
    },
};
