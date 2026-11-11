/**
 * GET /api/v1/promo?code=WELCOME15: what one code is worth to the caller.
 *
 * The codes table is staff's to list. This answers for one code at a time, and for a
 * once-only code says whether the caller has used it. Checkout checks again.
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { defineAction, promoCodes } from "../.quickback/define-action";
import { promoRedemptions } from "../../promo-redemptions/promo-redemptions";

export default defineAction({
    description: "What a promo code is worth to the caller: its percentage, or 0.",
    path: "/promo",
    method: "GET",
    input: z.object({ code: z.string().trim().min(1).max(40) }),
    output: z.object({ code: z.string(), pct: z.number(), used: z.boolean() }),
    access: { roles: ["USER"] },
    async execute({ db, input }) {
        const code = input.code.toUpperCase();
        const [promo] = await db.select().from(promoCodes).where(and(eq(promoCodes.code, code), eq(promoCodes.active, true)));
        if (!promo) return { code, pct: 0, used: false };
        if (promo.oncePerUser) {
            const [used] = await db.select().from(promoRedemptions).where(eq(promoRedemptions.code, code));
            if (used) return { code, pct: 0, used: true };
        }
        return { code, pct: promo.pct, used: false };
    },
});
