/**
 * The catalogue. Anyone may read it; only staff write it.
 */
import { feature, q } from "@quickback/compiler";
import { z } from "zod";

// quickback-allow SCHEMA_JSON_UNGUARDED: details, colors, sizes and tags are arrays that only staff write, whole.

export default feature("products", {
    columns: {
        id: q.id(),
        slug: q.text().required().unique(),
        style: q.text().required(),
        name: q.text().required(),
        category: q.text().required(),
        gender: q.text().required(),
        fabric: q.text().required(),
        weight: q.text().required(),
        fit: q.text().required(),
        description: q.text().required(),
        details: q.json(z.array(z.string())).required(),
        colors: q.json(z.array(z.object({ name: z.string(), hex: z.string(), photo: z.string() }))).required(),
        sizes: q.json(z.array(z.string())).required(),
        priceCents: q.int().required().check(">= 0"),
        compareCents: q.int().default(0).required(),
        tags: q.json(z.array(z.string())).required(),
        kind: q.text().required(),
        photo: q.text().required(),
        // The shop's own order, which the home page and "Everything" show.
        position: q.int().default(0).required(),
        ...q.audit(),
        ...q.softDelete(),
    },

    // FIREWALL: no owner or tenant, since the catalogue is everyone's. Deleted styles stay hidden.
    firewall: { softDelete: {} },

    // GUARDS: a style's slug is its URL, so it never changes.
    guards: {
        createable: ["slug", "style", "name", "category", "gender", "fabric", "weight", "fit", "description", "details", "colors", "sizes", "priceCents", "compareCents", "tags", "kind", "photo", "position"],
        updatable: ["style", "name", "category", "gender", "fabric", "weight", "fit", "description", "details", "colors", "sizes", "priceCents", "compareCents", "tags", "kind", "photo", "position"],
        immutable: ["slug"],
    },

    // ACCESS
    read: { access: { roles: ["PUBLIC"] }, pageSize: 100 },
    create: { access: { userRole: ["sysadmin"] } },
    update: { access: { userRole: ["sysadmin"] } },
    delete: { access: { userRole: ["sysadmin"] }, mode: "soft" },
});
