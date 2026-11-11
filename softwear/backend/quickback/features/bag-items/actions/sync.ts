/**
 * PUT /api/v1/bag: make the caller's bag exactly these lines.
 *
 * The Exact app keeps its bag on the device and sends it whole whenever it changes while
 * someone is signed in. The scoped `db` deletes and inserts only the caller's rows.
 */
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { ActionError } from "@quickback/compiler";
import { defineAction, bagItems } from "../.quickback/define-action";
import { products } from "../../products/products";

export default defineAction({
    description: "Replace the caller's bag with the lines given.",
    path: "/bag",
    method: "PUT",
    input: z.object({
        lines: z.array(z.object({
            slug: z.string().min(1).max(120),
            color: z.string().min(1).max(80),
            size: z.string().min(1).max(20),
            qty: z.number().int().min(1).max(10),
        })).max(50),
    }),
    output: z.object({ lines: z.number() }),
    access: { roles: ["USER"] },
    async execute({ db, input, ctx }) {
        const slugs = [...new Set(input.lines.map((l) => l.slug))];
        const known = slugs.length ? await db.select({ slug: products.slug }).from(products).where(inArray(products.slug, slugs)) : [];
        const missing = slugs.find((s) => !known.some((k) => k.slug === s));
        if (missing) throw new ActionError(`There is no product called ${missing}.`, "PRODUCT_UNKNOWN", 400);
        // One row per style, colour and size: a repeated line adds to it, up to ten.
        const merged = new Map<string, { productSlug: string; color: string; size: string; qty: number }>();
        for (const l of input.lines) {
            const key = `${l.slug}|${l.color}|${l.size}`;
            merged.set(key, { productSlug: l.slug, color: l.color, size: l.size, qty: Math.min(10, (merged.get(key)?.qty ?? 0) + l.qty) });
        }
        await db.delete(bagItems).where(eq(bagItems.ownerId, ctx.userId!));
        if (merged.size > 0) await db.insert(bagItems).values([...merged.values()]);
        return { lines: merged.size };
    },
});
