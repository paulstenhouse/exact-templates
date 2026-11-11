/**
 * POST /api/v1/notify: "Tell me when it's back". Anyone may ask. No email is sent in this demo.
 * A PUBLIC write, so it goes the same way as subscribers/actions/join.ts.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ActionError } from "@quickback/compiler";
import { defineAction, restockRequests } from "../.quickback/define-action";
import { products } from "../../products/products";
import { createDb } from "../../../db";

export default defineAction({
    description: "Ask to be told when a sold-out style is back.",
    path: "/notify",
    method: "POST",
    input: z.object({ email: z.string().trim().toLowerCase().email().max(254), slug: z.string().min(1).max(120) }),
    output: z.object({ slug: z.string() }),
    access: { roles: ["PUBLIC"] },
    unsafe: { reason: "An anonymous visitor asks for a restock note: one insert, with no caller to stamp it.", crossTenant: false },
    async execute({ input, env }) {
        const raw = createDb(env.DB);
        const [product] = await raw.select({ slug: products.slug }).from(products).where(eq(products.slug, input.slug));
        if (!product) throw new ActionError("No such product.", "PRODUCT_UNKNOWN", 404);
        await raw.insert(restockRequests).values({ email: input.email, productSlug: input.slug, createdBy: "system:public-notify", modifiedBy: "system:public-notify" }).onConflictDoNothing();
        return { slug: input.slug };
    },
});
