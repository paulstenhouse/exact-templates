/**
 * GET /api/v1/me: the signed-in shopper, as the app's Account page shows them.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ActionError } from "@quickback/compiler";
import { defineAction } from "../.quickback/define-action";
import { subscribers } from "../../subscribers/subscribers";
import { promoRedemptions } from "../../promo-redemptions/promo-redemptions";

export default defineAction({
    description: "The signed-in shopper: their address, name, whether they are on the list, and their welcome code while it is unused.",
    path: "/me",
    method: "GET",
    input: z.object({}),
    output: z.object({ email: z.string(), name: z.string(), memberSince: z.string(), subscribed: z.boolean(), code: z.string() }),
    access: { roles: ["AUTHENTICATED"] },
    async execute({ db, auth, c }) {
        const session = await auth.api.getSession({ headers: c.req.raw.headers });
        if (!session) throw new ActionError("Sign in first.", "AUTH_MISSING", 401);
        const { email, name, createdAt } = session.user;
        const [onList] = await db.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.email, email.toLowerCase()));
        // Owner-scoped: this only ever finds the caller's own redemption.
        const [usedWelcome] = await db.select({ id: promoRedemptions.id }).from(promoRedemptions).where(eq(promoRedemptions.code, "WELCOME15"));
        return { email, name: name ?? "", memberSince: new Date(createdAt).toISOString(), subscribed: Boolean(onList), code: usedWelcome ? "" : "WELCOME15" };
    },
});
