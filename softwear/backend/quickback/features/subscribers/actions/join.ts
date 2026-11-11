/**
 * POST /api/v1/subscribe: join the mailing list. Anyone may, signed in or not.
 *
 * A PUBLIC caller has no user id for the audit columns, so the scoped `db` refuses the
 * write. This door declares that (`unsafe`) and writes one row through the features
 * database itself. Every call is recorded in the security audit log.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineAction, subscribers } from "../.quickback/define-action";
import { createDb } from "../../../db";

export default defineAction({
    description: "Join the mailing list. Answers the welcome code, and whether the address was already on the list.",
    path: "/subscribe",
    method: "POST",
    input: z.object({ email: z.string().trim().toLowerCase().email().max(254) }),
    output: z.object({ code: z.string(), returning: z.boolean() }),
    access: { roles: ["PUBLIC"] },
    unsafe: { reason: "An anonymous visitor joins the mailing list: one insert, with no caller to stamp it.", crossTenant: false },
    async execute({ input, env }) {
        const raw = createDb(env.DB);
        const [known] = await raw.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.email, input.email));
        if (known) return { code: "WELCOME15", returning: true };
        await raw.insert(subscribers).values({ email: input.email, createdBy: "system:public-subscribe", modifiedBy: "system:public-subscribe" }).onConflictDoNothing();
        return { code: "WELCOME15", returning: false };
    },
});
